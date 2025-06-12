const Booking = require("../models/Booking");
const Room = require("../models/Room");
const Hotel = require("../models/Hotel");
const NotificationService = require("../services/notificationService");
const sendEmail = require("../utils/sendEmail");
const ZaloPayService = require("../services/zaloPayService");
const VNPayService = require("../services/vnPayService");
const Payment = require("../models/Payment");
const mongoose = require("mongoose");
const { validateVoucher } = require("../services/voucherService");
const { recordRetryFailure } = require("../utils/monitoring");

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Tạo booking mới
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - checkIn
 *               - checkOut
 *               - contactInfo
 *             properties:
 *               roomId:
 *                 type: string
 *                 description: ID phòng
 *               checkIn:
 *                 type: string
 *                 format: date
 *                 description: Ngày check-in
 *               checkOut:
 *                 type: string
 *                 format: date
 *                 description: Ngày check-out
 *               voucherId:
 *                 type: string
 *                 description: ID voucher (nếu có)
 *               paymentMethod:
 *                 type: string
 *                 enum: [zalopay, vnpay, credit_card, paypal]
 *                 description: Phương thức thanh toán
 *               bookingFor:
 *                 type: string
 *                 enum: [self, other]
 *                 description: Đặt cho bản thân hay người khác
 *               contactInfo:
 *                 type: object
 *                 required:
 *                   - name
 *                   - email
 *                   - phone
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *               guestInfo:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *               specialRequests:
 *                 type: object
 *                 properties:
 *                   earlyCheckIn:
 *                     type: boolean
 *                   lateCheckOut:
 *                     type: boolean
 *                   additionalRequests:
 *                     type: string
 *     responses:
 *       201:
 *         description: Tạo booking thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc phòng không có sẵn
 *       404:
 *         description: Không tìm thấy phòng
 *       500:
 *         description: Lỗi server
 */
exports.createBooking = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    console.log("Received booking request:", req.body);

    const {
      roomId,
      checkIn,
      checkOut,
      voucherId,
      paymentMethod = "zalopay",
      bookingFor = "self",
      contactInfo = {},
      guestInfo = {},
      specialRequests = {},
    } = req.body;

    // Validate contact information
    if (!contactInfo.name || !contactInfo.email || !contactInfo.phone) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin liên hệ",
      });
    }

    // Validate guest information if booking for someone else
    if (bookingFor === "other" && (!guestInfo.name || !guestInfo.phone)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp tên và số điện thoại của người lưu trú",
      });
    }

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    checkInDate.setHours(14, 0, 0, 0);
    checkOutDate.setHours(12, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkInDate < today) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message:
          "Ngày check-in không hợp lệ, vui lòng chọn từ ngày hôm nay trở đi",
      });
    }

    if (checkOutDate <= checkInDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Ngày check-out phải sau ngày check-in",
      });
    }

    // Get room details
    const room = await Room.findById(roomId)
      .populate({
        path: 'hotelId',
        select: 'name address city'
      })
      .session(session);
    
    if (!room) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    // Lấy thông tin khách sạn từ room đã populate
    const hotelInfo = room.hotelId || {};
    const hotelName = hotelInfo.name || 'Chưa có tên khách sạn';
    const hotelAddress = hotelInfo.address || 'Chưa cập nhật địa chỉ';
    const roomTypeName = room.roomType || 'Chưa xác định loại phòng';

    console.log("Thông tin khách sạn từ room:", {
      hotelName,
      hotelAddress,
      roomType: roomTypeName,
      roomId: room._id
    });

    // Check room availability
    const isAvailable = await checkRoomAvailability(
      roomId,
      checkInDate,
      checkOutDate
    );
    if (!isAvailable) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Phòng không có sẵn trong thời gian này",
      });
    }

    // Calculate original price
    const numberOfDays = Math.ceil(
      (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)
    );
    const originalPrice = room.price * numberOfDays;

    // Validate voucher
    const voucherValidation = await validateVoucher(
      voucherId,
      originalPrice,
      checkInDate
    );
    if (!voucherValidation.success) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        errorCode: voucherValidation.errorCode,
        message: voucherValidation.message,
      });
    }

    // Create booking object
    const bookingData = {
      user: req.user.id,
      room: roomId,
      bookingFor,
      contactInfo,
      guestInfo: bookingFor === "other" ? guestInfo : undefined,
      specialRequests,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      originalPrice,
      status: "pending",
      paymentMethod,
      voucher: voucherValidation.voucher
        ? voucherValidation.voucher._id
        : undefined,
      discountAmount: voucherValidation.discountAmount,
      finalPrice: originalPrice - voucherValidation.discountAmount,
    };

    // Create booking
    const [booking] = await Booking.create([bookingData], { session });

    // Increment voucher usage if applicable
    if (voucherValidation.voucher) {
      voucherValidation.voucher.usageCount += 1;
      if (
        voucherValidation.voucher.usageLimit &&
        voucherValidation.voucher.usageCount >=
          voucherValidation.voucher.usageLimit
      ) {
        voucherValidation.voucher.status = "inactive";
      }
      await voucherValidation.voucher.save({ session });
    }

    // Populate booking details for response
    await booking.populate([
      { path: "voucher", select: "code discount discountType" },
      {
        path: "room",
        select: "name roomType price hotelId",
        populate: { path: "hotelId", select: "name address city" },
      },
      { path: "user", select: "name email" },
    ]);

    // Create notification
    await NotificationService.createBookingNotification(booking);

    // Format payment method for email
    const formattedPaymentMethod =
      paymentMethod === "zalopay"
        ? "ZaloPay"
        : paymentMethod === "vnpay"
        ? "VNPay"
        : paymentMethod === "credit_card"
        ? "Thẻ tín dụng"
        : "PayPal";

    // Function to create email content
    const createEmailContent = (isForBooker = true) => {
      const recipientInfo = isForBooker ? contactInfo : guestInfo;
      const recipientName = recipientInfo.name;
      
      return `
        <h1>Xác nhận đặt phòng</h1>
        ${isForBooker 
          ? `<p>Chào ${recipientName},</p>
             <p>Cảm ơn bạn đã đặt phòng ${bookingFor === "other" ? "cho " + guestInfo.name : ""} tại khách sạn của chúng tôi.</p>` 
          : `<p>Chào ${recipientName},</p>
             <p>Bạn có một đặt phòng được thực hiện bởi ${contactInfo.name}. Dưới đây là thông tin chi tiết:</p>`
        }
        
        <h2>Thông tin đặt phòng:</h2>
        <ul>
          <li>Khách sạn: ${hotelName}</li>
          <li>Địa chỉ: ${hotelAddress}</li>
          <li>Loại phòng: ${roomTypeName}</li>
          <li>Tên phòng: ${room.name}</li>
          <li>Ngày check-in: ${new Date(booking.checkIn).toLocaleDateString("vi-VN")} (14:00)</li>
          <li>Ngày check-out: ${new Date(booking.checkOut).toLocaleDateString("vi-VN")} (12:00)</li>
          <li>Số đêm: ${numberOfDays}</li>
          ${isForBooker ? `
          <li>Giá gốc: ${booking.originalPrice.toLocaleString("vi-VN")}đ</li>
          ${booking.voucher ? `<li>Mã giảm giá: ${booking.voucher.code}</li>` : ""}
          ${booking.discountAmount > 0 ? `<li>Giảm giá: ${booking.discountAmount.toLocaleString("vi-VN")}đ</li>` : ""}
          <li>Tổng thanh toán: ${booking.finalPrice.toLocaleString("vi-VN")}đ</li>
          <li>Phương thức thanh toán: ${formattedPaymentMethod}</li>
          ` : `<li>Tổng chi phí: ${booking.finalPrice.toLocaleString("vi-VN")}đ</li>`}
        </ul>
        
        <h2>Thông tin người đặt phòng:</h2>
        <ul>
          <li>Tên: ${contactInfo.name}</li>
          <li>Email: ${contactInfo.email}</li>
          <li>Số điện thoại: ${contactInfo.phone}</li>
        </ul>
        
        ${bookingFor === "other" ? `
        <h2>Thông tin người lưu trú:</h2>
        <ul>
          <li>Tên: ${guestInfo.name}</li>
          <li>Email: ${guestInfo.email || "Không có"}</li>
          <li>Số điện thoại: ${guestInfo.phone}</li>
        </ul>
        ` : ""}
        
        ${specialRequests.earlyCheckIn || specialRequests.lateCheckOut || specialRequests.additionalRequests ? `
        <h2>Yêu cầu đặc biệt:</h2>
        <ul>
          ${specialRequests.earlyCheckIn ? "<li>Yêu cầu check-in sớm</li>" : ""}
          ${specialRequests.lateCheckOut ? "<li>Yêu cầu check-out muộn</li>" : ""}
          ${specialRequests.additionalRequests ? `<li>Yêu cầu khác: ${specialRequests.additionalRequests}</li>` : ""}
        </ul>
        ` : ""}
        
        <p><strong>Trạng thái:</strong> Chờ xác nhận</p>
        <p><strong>Mã đặt phòng:</strong> ${booking._id}</p>
        
        ${isForBooker ? `
        <h2>Lưu ý quan trọng:</h2>
        <ul>
          <li>Vui lòng mang theo giấy tờ tùy thân khi check-in</li>
          <li>Check-in: 14:00 | Check-out: 12:00</li>
          <li>Nếu có thắc mắc, vui lòng liên hệ với chúng tôi</li>
        </ul>
        ` : `
        <h2>Hướng dẫn check-in:</h2>
        <ul>
          <li>Mang theo giấy tờ tùy thân và mã đặt phòng: ${booking._id}</li>
          <li>Thời gian check-in: 14:00 ngày ${new Date(booking.checkIn).toLocaleDateString("vi-VN")}</li>
          <li>Thời gian check-out: 12:00 ngày ${new Date(booking.checkOut).toLocaleDateString("vi-VN")}</li>
          <li>Liên hệ người đặt: ${contactInfo.name} - ${contactInfo.phone}</li>
        </ul>
        `}
        
        <p>Cảm ơn bạn đã chọn dịch vụ của chúng tôi!</p>
      `;
    };

    // Send emails
    const emailPromises = [];
    const emailResults = {
      booker: { sent: false, error: null },
      guest: { sent: false, error: null }
    };
    
    try {
      // Gửi email cho người đặt phòng
      console.log(`Attempting to send booking confirmation email to booker: ${contactInfo.email}`);
      const bookerEmailPromise = sendEmail({
        email: contactInfo.email,
        subject: `Xác nhận đặt phòng tại ${hotelName} - Mã: ${booking._id.toString().slice(-8)}`,
        message: createEmailContent(true),
      }).then(() => {
        console.log(`Successfully sent booking confirmation email to booker: ${contactInfo.email}`);
        emailResults.booker.sent = true;
      }).catch(error => {
        console.error(`Failed to send booking confirmation email to booker: ${contactInfo.email}`, error);
        emailResults.booker.error = error.message;
      });
      emailPromises.push(bookerEmailPromise);

      // Gửi email cho người lưu trú nếu đặt cho người khác và có email
      if (bookingFor === "other" && guestInfo.email && guestInfo.email.trim() !== "") {
        console.log(`Attempting to send booking notification email to guest: ${guestInfo.email}`);
        const guestEmailPromise = sendEmail({
          email: guestInfo.email,
          subject: `Thông báo đặt phòng tại ${hotelName} - Mã: ${booking._id.toString().slice(-8)}`,
          message: createEmailContent(false),
        }).then(() => {
          console.log(`Successfully sent booking notification email to guest: ${guestInfo.email}`);
          emailResults.guest.sent = true;
        }).catch(error => {
          console.error(`Failed to send booking notification email to guest: ${guestInfo.email}`, error);
          emailResults.guest.error = error.message;
        });
        emailPromises.push(guestEmailPromise);
      }

      // Chờ tất cả email được gửi
      await Promise.allSettled(emailPromises);
      console.log("Email sending process completed", emailResults);
      
    } catch (emailError) {
      console.error("Error in email sending process:", emailError.message, emailError.stack);
      // Log lỗi nhưng không làm gián đoạn quá trình tạo booking
    }

    // Generate payment URL
    let paymentUrl;
    if (paymentMethod === "vnpay") {
      paymentUrl = await VNPayService.createPaymentUrl(booking);
    } else {
      paymentUrl = await ZaloPayService.createPaymentUrl(booking);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: booking,
      paymentUrl: paymentUrl.payUrl,
      transactionId: paymentUrl.transactionId,
      emailStatus: {
        booker: {
          sent: emailResults.booker.sent,
          error: emailResults.booker.error
        },
        guest: bookingFor === "other" ? {
          sent: emailResults.guest.sent,
          error: emailResults.guest.error
        } : null
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating booking:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

function validateHotelData(room) {
  const issues = [];
  
  if (!room.hotelId) {
    issues.push("Room không có thông tin hotelId");
  } else {
    if (!room.hotelId.name) {
      issues.push("Hotel thiếu tên");
    }
    if (!room.hotelId.address) {
      issues.push("Hotel thiếu địa chỉ");
    }
  }
  
  if (!room.roomType) {
    issues.push("Room thiếu roomType");
  }
  
  if (issues.length > 0) {
    console.warn("Dữ liệu thiếu:", issues.join(", "));
  }
  
  return issues.length === 0;
}
/**
 * @swagger
 * /api/bookings/retry-payment:
 *   post:
 *     summary: Thanh toán lại cho booking chưa hoàn tất
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *               - paymentMethod
 *             properties:
 *               bookingId:
 *                 type: string
 *                 description: ID booking
 *               paymentMethod:
 *                 type: string
 *                 enum: [zalopay, vnpay]
 *                 description: Phương thức thanh toán
 *     responses:
 *       200:
 *         description: Tạo lại thanh toán thành công
 *       400:
 *         description: Lỗi nghiệp vụ
 *       500:
 *         description: Lỗi server
 */
exports.retryPayment = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { bookingId, paymentMethod } = req.body;
    console.log(`Attempting to retry payment for booking ${bookingId}`);

    // Tìm booking
    const booking = await Booking.findById(bookingId)
      .populate("user")
      .populate("room")
      .session(session);

    if (!booking) {
      throw new Error("Không tìm thấy booking");
    }

    // Kiểm tra trạng thái thanh toán trong Payment
    const payment = await Payment.findOne({
      bookingId: bookingId,
      status: { $in: ["completed", "refunding", "refunded"] },
    }).session(session);

    if (payment) {
      throw new Error(
        `Giao dịch đã được hoàn tất hoặc đang trong quá trình hoàn tiền (trạng thái: ${payment.status})`
      );
    }

    // Kiểm tra quyền sở hữu
    if (booking.user._id.toString() !== req.user.id) {
      throw new Error(
        "Không có quyền thực hiện thanh toán lại cho booking này"
      );
    }

    // Kiểm tra trạng thái booking
    if (booking.status !== "pending") {
      throw new Error(
        "Chỉ có thể thanh toán lại cho booking ở trạng thái pending"
      );
    }

    // Kiểm tra trạng thái thanh toán
    if (booking.paymentStatus === "paid") {
      throw new Error("Booking đã được thanh toán");
    }

    // Kiểm tra ngày check-in
    const now = new Date();
    const checkInDate = new Date(booking.checkIn);
    if (checkInDate < now) {
      throw new Error(
        "Không thể thanh toán lại cho booking đã qua ngày check-in"
      );
    }

    // Kiểm tra số lần thử thanh toán lại (tối đa 3 lần)
    const MAX_RETRY_ATTEMPTS = 3;
    if (booking.retryCount >= MAX_RETRY_ATTEMPTS) {
      throw new Error(
        `Đã vượt quá số lần thử thanh toán lại cho phép (${MAX_RETRY_ATTEMPTS} lần)`
      );
    }

    // Kiểm tra thời gian tổng cho phép thử lại (48 giờ kể từ khi tạo booking)
    const bookingAgeHours = (now - booking.createdAt) / (1000 * 60 * 60);
    if (bookingAgeHours > 48) {
      throw new Error("Đã hết thời gian cho phép thử lại thanh toán");
    }

    // Kiểm tra thời gian kể từ lần thử cuối (hủy nếu quá 24 giờ)
    const AUTO_CANCEL_HOURS = 24;
    if (booking.retryCount > 0 && booking.lastRetryAt) {
      const timeSinceLastRetry =
        (now - new Date(booking.lastRetryAt)) / (1000 * 60 * 60);
      if (timeSinceLastRetry > AUTO_CANCEL_HOURS) {
        booking.status = "cancelled";
        booking.cancelledAt = new Date();
        booking.cancellationReason = "payment_timeout";
        await booking.save({ session });
        throw new Error("Booking đã bị hủy do quá thời gian thanh toán");
      }
    }

    // Kiểm tra phòng còn khả dụng
    const isAvailable = await checkRoomAvailability(
      booking.room._id,
      booking.checkIn,
      booking.checkOut,
      booking._id
    );
    if (!isAvailable) {
      throw new Error("Phòng không còn khả dụng cho thời gian này");
    }

    // Kiểm tra giá phòng và tính toán lại finalPrice
    const room = await Room.findById(booking.room._id).session(session);
    const numberOfDays = Math.ceil(
      (booking.checkOut - booking.checkIn) / (1000 * 60 * 60 * 24)
    );
    const newOriginalPrice = room.price * numberOfDays;

    if (newOriginalPrice !== booking.originalPrice) {
      throw new Error("Giá phòng đã thay đổi, vui lòng tạo booking mới");
    }

    // Kiểm tra lại voucher nếu có
    if (booking.voucher) {
      const voucherValidation = await validateVoucher(
        booking.voucher,
        booking.originalPrice,
        booking.checkIn
      );
      if (!voucherValidation.success) {
        throw new Error(`Voucher không hợp lệ: ${voucherValidation.message}`);
      }
      booking.discountAmount = voucherValidation.discountAmount;
      booking.finalPrice =
        booking.originalPrice - voucherValidation.discountAmount;
    }

    // Cập nhật retryCount và lastRetryAt
    booking.retryCount += 1;
    booking.lastRetryAt = new Date();
    await booking.save({ session });

    // Gửi thông báo về lần thử thanh toán lại
    await NotificationService.createNotification(
      {
        user: booking.user._id,
        title: "Thử thanh toán lại",
        message: `Bạn đã yêu cầu thử thanh toán lại cho đơn đặt phòng #${booking._id} (lần ${booking.retryCount})`,
        type: "payment",
        relatedModel: "Booking",
        relatedId: booking._id,
      },
      { session }
    );

    // Gửi email thông báo
    const message = `
      <h1>Thông báo thử thanh toán lại</h1>
      <p>Xin chào ${booking.user.name},</p>
      <p>Bạn vừa yêu cầu thử thanh toán lại cho đơn đặt phòng #${booking._id}.</p>
      <p>Thông tin:</p>
      <ul>
        <li>Mã đơn: ${booking._id}</li>
        <li>Phòng: ${booking.room.roomType}</li>
        <li>Số lần thử: ${booking.retryCount}</li>
        <li>Phương thức thanh toán: ${paymentMethod}</li>
      </ul>
      <p>Vui lòng hoàn tất thanh toán qua liên kết được cung cấp.</p>
    `;
    await sendEmail({
      email: booking.user.email,
      subject: "Thông báo thử thanh toán lại",
      message,
    });

    console.log("Booking data for payment:", {
      bookingId: booking._id,
      userId: booking.user._id,
      roomId: booking.room._id,
      finalPrice: booking.finalPrice,
      paymentMethod: paymentMethod,
    });

    // Tạo URL thanh toán mới
    let paymentUrl;
    if (paymentMethod === "vnpay") {
      paymentUrl = await VNPayService.createPaymentUrl(booking);
    } else {
      paymentUrl = await ZaloPayService.createPaymentUrl(booking);
    }

    await session.commitTransaction();
    res.status(200).json({
      success: true,
      paymentUrl: paymentUrl.payUrl,
      transactionId: paymentUrl.transactionId,
      retryCount: booking.retryCount,
    });
  } catch (error) {
    await session.abortTransaction();
    // Sử dụng req.body.bookingId thay vì bookingId để đảm bảo luôn có giá trị
    const logBookingId = req.body.bookingId || "unknown";
    console.error(
      `Error retrying payment for booking ${logBookingId}: ${error.message}`
    );
    console.error(error.stack);
    // Ghi metric lỗi, chỉ gọi nếu bookingId tồn tại
    if (req.body.bookingId) {
      recordRetryFailure(
        req.body.bookingId,
        req.body.paymentMethod || "unknown",
        error
      );
    }
    res
      .status(
        error.message.includes("Không") ||
          error.message.includes("Vui lòng") ||
          error.message.includes("Đã")
          ? 400
          : 500
      )
      .json({
        success: false,
        message:
          error.message.includes("Không") ||
          error.message.includes("Vui lòng") ||
          error.message.includes("Đã")
            ? error.message
            : `Lỗi server khi thử thanh toán lại: ${error.message}`,
        details: error.response?.data || error.message,
      });
  } finally {
    session.endSession();
  }
};
// Phương thức xác nhận thanh toán
exports.confirmPayment = async (req, res) => {
  try {
    const { transactionId, paymentMethod = "zalopay" } = req.body;
    let result;

    if (paymentMethod === "vnpay") {
      result = await VNPayService.verifyPayment(transactionId);
    } else {
      result = await ZaloPayService.verifyPayment(transactionId);
    }

    if (result.success) {
      res.status(200).json({
        success: true,
        message: "Thanh toán thành công",
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Thanh toán không thành công",
        data: result,
      });
    }
  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi xác nhận thanh toán",
    });
  }
};

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: Lấy danh sách booking của user
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách booking thành công
 *       500:
 *         description: Lỗi server
 */
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate("room")
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/bookings/{id}/status:
 *   put:
 *     summary: Cập nhật trạng thái booking
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID booking
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, cancelled, completed]
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       403:
 *         description: Không có quyền cập nhật
 *       404:
 *         description: Không tìm thấy booking
 *       500:
 *         description: Lỗi server
 */
exports.updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy booking",
      });
    }

    // Kiểm tra quyền cập nhật
    if (req.user.role !== "admin" && req.user.role !== "partner") {
      return res.status(403).json({
        success: false,
        message: "Không có quyền cập nhật booking",
      });
    }

    // Cập nhật trạng thái
    booking.status = status;
    await booking.save();

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

// Hàm kiểm tra phòng có sẵn
async function checkRoomAvailability(
  roomId,
  checkIn,
  checkOut,
  currentBookingId = null
) {
  const checkInTime = new Date(checkIn);
  checkInTime.setHours(14, 0, 0, 0);
  const checkOutTime = new Date(checkOut);
  checkOutTime.setHours(12, 0, 0, 0);

  const query = {
    room: roomId,
    status: { $ne: "cancelled" },
    $or: [
      {
        checkIn: { $lt: checkOutTime },
        checkOut: { $gt: checkInTime },
      },
    ],
  };

  // Loại trừ booking hiện tại nếu được cung cấp
  if (currentBookingId) {
    query._id = { $ne: currentBookingId };
  }

  const existingBooking = await Booking.findOne(query);

  return !existingBooking;
}
// Kiểm tra trạng thái thanh toán
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const paymentStatus = await ZaloPayService.verifyPayment(transactionId);
    res.json(paymentStatus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Xử lý callback từ ZaloPay
// @route   POST /api/bookings/zalopay-callback
// @access  Public
exports.zaloPayCallback = async (req, res) => {
  try {
    console.log("Received ZaloPay callback:", req.body);
    await ZaloPayService.handleCallback(req, res);
  } catch (error) {
    console.error("ZaloPay callback processing error:", error);
    res.status(500).json({
      return_code: -1,
      return_message: "Lỗi xử lý callback",
    });
  }
};

// @desc    Xử lý khi người dùng quay lại từ ZaloPay
// @route   GET /api/bookings/zalopay-return
// @access  Public
exports.zaloPayReturn = async (req, res) => {
  try {
    console.log("User returned from ZaloPay payment:", req.query);
    await ZaloPayService.handleRedirect(req, res);
  } catch (error) {
    console.error("ZaloPay return processing error:", error);
    res.redirect("/payment-error");
  }
};

// @desc    Xử lý khi người dùng quay lại từ VNPay
// @route   GET /api/bookings/vnpay-return
// @access  Public
exports.vnPayReturn = async (req, res) => {
  try {
    console.log("User returned from VNPay payment:", req.query);
    await VNPayService.handleCallback(req, res);
  } catch (error) {
    console.error("VNPay return processing error:", error);
    res.redirect("/payment-error");
  }
};

// @desc    Xử lý callback từ VNPay
// @route   POST /api/bookings/vnpay-callback
// @access  Public
exports.vnPayCallback = async (req, res) => {
  try {
    console.log("Received VNPay callback:", req.body);
    await VNPayService.handleCallback(req, res);
  } catch (error) {
    console.error("VNPay callback processing error:", error);
    res.status(500).json({
      return_code: -1,
      return_message: "Lỗi xử lý callback",
    });
  }
};

// @desc    Kiểm tra trạng thái hoàn tiền VNPay
// @route   GET /api/bookings/vnpay-refund-status/:transactionId
// @access  Private
exports.checkVNPayRefundStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Tìm giao dịch thanh toán
    const payment = await Payment.findOne({ transactionId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giao dịch",
      });
    }

    // Kiểm tra trạng thái hoàn tiền
    if (!payment.refundTransactionId) {
      return res.json({
        success: false,
        message: "Chưa có yêu cầu hoàn tiền cho giao dịch này",
        payment: {
          transactionId: payment.transactionId,
          status: payment.status,
        },
      });
    }

    // Kiểm tra trạng thái hoàn tiền
    const refundStatus = await VNPayService.checkRefundStatus(
      payment.refundTransactionId
    );

    return res.json(refundStatus);
  } catch (error) {
    console.error("Lỗi kiểm tra trạng thái hoàn tiền:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi kiểm tra trạng thái hoàn tiền",
    });
  }
};

// Cập nhật phương thức cancelBooking để sử dụng các tính năng mới
exports.cancelBooking = async (req, res) => {
  try {
    console.log(`=== BẮT ĐẦU HỦY BOOKING ${req.params.id} ===`);
    console.log(
      `Người dùng ${req.user.id} yêu cầu hủy booking ${req.params.id}`
    );

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      console.log(`Không tìm thấy booking với ID ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy booking",
      });
    }

    console.log(
      `Thông tin booking tìm thấy: ${JSON.stringify({
        id: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        userId: booking.user,
      })}`
    );

    // Kiểm tra quyền hủy booking
    if (booking.user.toString() !== req.user.id && req.user.role !== "admin") {
      console.log(
        `Người dùng ${req.user.id} không có quyền hủy booking ${booking._id}`
      );
      return res.status(403).json({
        success: false,
        message: "Không có quyền hủy booking này",
      });
    }

    // Kiểm tra trạng thái booking có thể hủy
    if (!["confirmed", "pending"].includes(booking.status)) {
      console.log(
        `Không thể hủy booking ${booking._id} với trạng thái ${booking.status}`
      );
      return res.status(400).json({
        success: false,
        message: "Không thể hủy booking với trạng thái hiện tại",
      });
    }

    // Kiểm tra thời gian check-in so với thời gian hiện tại
    const now = new Date();
    const checkInDate = new Date(booking.checkIn);
    const timeUntilCheckIn = checkInDate - now;
    const hoursUntilCheckIn = timeUntilCheckIn / (1000 * 60 * 60);

    console.log(
      `Thời gian còn lại đến check-in: ${hoursUntilCheckIn.toFixed(2)} giờ`
    );

    // Kiểm tra chính sách hủy phòng (Ví dụ: chỉ được hủy trước 24h)
    const CANCELLATION_POLICY_HOURS = 24;
    if (hoursUntilCheckIn < CANCELLATION_POLICY_HOURS) {
      console.log(
        `Không thể hủy booking ${booking._id}, còn ít hơn ${CANCELLATION_POLICY_HOURS} giờ đến check-in`
      );
      return res.status(400).json({
        success: false,
        message: `Không thể hủy booking khi còn ít hơn ${CANCELLATION_POLICY_HOURS} giờ đến thời gian check-in`,
      });
    }

    // Xử lý theo trạng thái thanh toán
    if (booking.paymentStatus === "paid") {
      console.log(
        `Booking ${booking._id} đã được thanh toán, tiến hành hoàn tiền`
      );

      try {
        let refundResult = false;

        // Xử lý hoàn tiền dựa trên phương thức thanh toán
        if (booking.paymentMethod === "zalopay") {
          refundResult = await ZaloPayService.refundPayment(booking);
        } else if (booking.paymentMethod === "vnpay") {
          refundResult = await VNPayService.refundPayment(booking);
        } else {
          console.error(
            `Không hỗ trợ hoàn tiền cho phương thức thanh toán: ${booking.paymentMethod}`
          );
          return res.status(400).json({
            success: false,
            message: "Không hỗ trợ hoàn tiền cho phương thức thanh toán này",
          });
        }

        console.log(
          `Kết quả hoàn tiền: ${refundResult ? "Thành công" : "Thất bại"}`
        );

        if (!refundResult) {
          return res.status(400).json({
            success: false,
            message: "Không thể hoàn tiền, vui lòng liên hệ hỗ trợ",
          });
        }

        // Các service đã cập nhật trạng thái booking
        res.status(200).json({
          success: true,
          message: "Hủy booking và hoàn tiền thành công",
        });
      } catch (refundError) {
        console.error(`Lỗi hoàn tiền: ${refundError.message}`);
        return res.status(500).json({
          success: false,
          message: `Lỗi hoàn tiền: ${refundError.message}`,
        });
      }
    } else {
      // Nếu chưa thanh toán, chỉ cần cập nhật trạng thái
      console.log(
        `Booking ${booking._id} chưa thanh toán, chỉ cập nhật trạng thái`
      );

      booking.status = "cancelled";
      booking.cancelledAt = new Date();
      booking.cancellationReason = "user_requested";
      await booking.save();

      console.log(
        `Đã cập nhật booking ${booking._id} thành trạng thái 'cancelled'`
      );

      // Gửi thông báo hủy
      await NotificationService.createNotification({
        user: booking.user,
        title: "Đặt phòng đã hủy",
        message: `Đơn đặt phòng #${booking._id} đã được hủy thành công`,
        type: "booking",
        relatedModel: "Booking",
        relatedId: booking._id,
      });

      console.log(
        `Đã gửi thông báo hủy booking cho người dùng ${booking.user}`
      );

      res.status(200).json({
        success: true,
        message: "Hủy booking thành công",
      });
    }

    console.log(`=== KẾT THÚC HỦY BOOKING ${req.params.id} ===`);
  } catch (error) {
    console.error(`Lỗi hủy booking: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi hủy booking",
    });
  }
};
// @desc    Lấy toàn bộ booking của một khách sạn
// @route   GET /api/bookings/hotel/:hotelId
// @access  Private (Admin/Hotel Owner)
exports.getHotelBookings = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const {
      status,
      startDate,
      endDate,
      sort = "-createdAt",
      page = 1,
      limit = 10,
    } = req.query;

    console.log(`Fetching bookings for hotel ${hotelId}`);
    console.log(
      `Query params: status=${status}, startDate=${startDate}, endDate=${endDate}, sort=${sort}, page=${page}, limit=${limit}`
    );

    // Xác thực quyền truy cập (chỉ admin hoặc chủ khách sạn)
    if (req.user.role !== "admin" && req.user.role !== "partner") {
      console.log(
        `User ${req.user.id} with role ${req.user.role} not authorized to view hotel bookings`
      );
      return res.status(403).json({
        success: false,
        message: "Không có quyền truy cập danh sách đặt phòng của khách sạn",
      });
    }

    // Nếu là chủ khách sạn, cần kiểm tra xem họ có sở hữu khách sạn này không
    if (req.user.role === "partner") {
      // Lấy danh sách khách sạn thuộc quyền sở hữu của user
      const hotels = await Hotel.find({ ownerId: req.user.id }).select("_id");
      const hotelIds = hotels.map((hotel) => hotel._id.toString());

      if (!hotelIds.includes(hotelId)) {
        console.log(`Hotel owner ${req.user.id} doesn't own hotel ${hotelId}`);
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xem đặt phòng của khách sạn này",
        });
      }
    }

    // Tạo query để lấy phòng thuộc về khách sạn
    const rooms = await Room.find({ hotelId }).select("_id");
    const roomIds = rooms.map((room) => room._id);

    console.log(`Found ${roomIds.length} rooms for hotel ${hotelId}`);

    // Khởi tạo điều kiện lọc
    const query = { room: { $in: roomIds } };

    // Áp dụng bộ lọc theo trạng thái nếu có
    if (
      status &&
      ["pending", "confirmed", "cancelled", "completed"].includes(status)
    ) {
      query.status = status;
    }

    // Áp dụng bộ lọc theo thời gian
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.$or = [
          {
            checkIn: { $gte: start, $lte: end },
          },
          {
            checkOut: { $gte: start, $lte: end },
          },
          {
            $and: [{ checkIn: { $lte: start } }, { checkOut: { $gte: end } }],
          },
        ];
      }
    }

    console.log(`Applying query filters: ${JSON.stringify(query)}`);

    // Tính tổng số booking phù hợp với bộ lọc
    const total = await Booking.countDocuments(query);

    // Thiết lập phân trang
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;

    // Thực hiện truy vấn với phân trang và sắp xếp
    const bookings = await Booking.find(query)
      .populate([
        { path: "user", select: "name email" },
        { path: "room", select: "roomType roomNumber price" },
        { path: "voucher", select: "code discount discountType" },
        { path: "paymentId", select: "amount transactionId status method" },
      ])
      .sort(sort)
      .skip(startIndex)
      .limit(limitNum);

    console.log(`Found ${bookings.length} bookings for hotel ${hotelId}`);

    // Thông tin phân trang
    const pagination = {
      total,
      currentPage: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };

    res.status(200).json({
      success: true,
      pagination,
      data: bookings,
    });
  } catch (error) {
    console.error(`Error fetching hotel bookings: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách đặt phòng của khách sạn",
    });
  }
};

/**
 * @swagger
 * /api/bookings/all:
 *   get:
 *     summary: Lấy toàn bộ booking trong hệ thống (admin)
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Lọc theo trạng thái booking
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *         description: Lọc theo trạng thái thanh toán
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *         description: Lọc theo khách sạn
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Lọc theo user
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *         description: Lọc theo phương thức thanh toán
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sắp xếp
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng mỗi trang
 *     responses:
 *       200:
 *         description: Lấy danh sách booking thành công
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
exports.getAllBookings = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      startDate,
      endDate,
      hotelId,
      userId,
      paymentMethod,
      sort = "-createdAt",
      page = 1,
      limit = 20,
    } = req.query;

    console.log(`Admin ${req.user.id} fetching all bookings`);
    console.log(
      `Query params: status=${status}, startDate=${startDate}, endDate=${endDate}, hotelId=${hotelId}, paymentStatus=${paymentStatus}, paymentMethod=${paymentMethod}, userId=${userId}`
    );

    // Chỉ admin mới có quyền truy cập
    if (req.user.role !== "admin") {
      console.log(
        `User ${req.user.id} with role ${req.user.role} not authorized to view all bookings`
      );
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có quyền truy cập tất cả đặt phòng",
      });
    }

    // Khởi tạo điều kiện lọc
    const query = {};

    // Áp dụng các bộ lọc
    if (
      status &&
      ["pending", "confirmed", "cancelled", "completed"].includes(status)
    ) {
      query.status = status;
    }

    if (
      paymentStatus &&
      ["pending", "paid", "failed", "refunded"].includes(paymentStatus)
    ) {
      query.paymentStatus = paymentStatus;
    }

    if (
      paymentMethod &&
      ["zalopay", "vnpay", "credit_card", "paypal"].includes(paymentMethod)
    ) {
      query.paymentMethod = paymentMethod;
    }

    if (userId) {
      try {
        query.user = mongoose.Types.ObjectId(userId);
      } catch (err) {
        console.warn(`Invalid userId format: ${userId}`);
      }
    }

    // Lọc theo thời gian
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.$or = [
          {
            checkIn: { $gte: start, $lte: end },
          },
          {
            checkOut: { $gte: start, $lte: end },
          },
          {
            $and: [{ checkIn: { $lte: start } }, { checkOut: { $gte: end } }],
          },
        ];
      }
    }

    // Lọc theo khách sạn (cần join với bảng Room)
    let roomIds = [];
    if (hotelId) {
      try {
        const rooms = await Room.find({
          hotelId: mongoose.Types.ObjectId(hotelId),
        }).select("_id");
        roomIds = rooms.map((room) => room._id);
        if (roomIds.length > 0) {
          query.room = { $in: roomIds };
        }
      } catch (err) {
        console.warn(`Invalid hotelId format or no rooms found: ${hotelId}`);
      }
    }

    console.log(`Applying query filters: ${JSON.stringify(query)}`);

    // Tính tổng số booking phù hợp với bộ lọc
    const total = await Booking.countDocuments(query);

    // Thiết lập phân trang
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;

    // Thực hiện truy vấn với phân trang và sắp xếp
    const bookings = await Booking.find(query)
      .populate([
        {
          path: "user",
          select: "name email phone",
        },
        {
          path: "room",
          select: "roomType roomNumber price hotelId",
          populate: {
            path: "hotelId",
            select: "name address city",
          },
        },
        {
          path: "voucher",
          select: "code discount discountType expiryDate",
        },
        {
          path: "paymentId",
          select: "amount transactionId status method createdAt updatedAt",
        },
      ])
      .sort(sort)
      .skip(startIndex)
      .limit(limitNum);

    console.log(`Found ${bookings.length} bookings matching criteria`);

    // Tính toán thống kê nhanh
    const stats = {
      totalBookings: total,
      totalRevenue: await Booking.aggregate([
        { $match: { ...query, paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$finalPrice" } } },
      ]).then((result) => (result.length > 0 ? result[0].total : 0)),
      statusCounts: await Booking.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).then((result) =>
        result.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {})
      ),
      paymentMethodCounts: await Booking.aggregate([
        { $match: query },
        { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
      ]).then((result) =>
        result.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {})
      ),
    };

    // Thông tin phân trang
    const pagination = {
      total,
      currentPage: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };

    res.status(200).json({
      success: true,
      pagination,
      stats,
      data: bookings,
    });
  } catch (error) {
    console.error(`Error fetching all bookings: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách đặt phòng",
    });
  }
};

/**
 * @swagger
 * /api/bookings/{id}:
 *   get:
 *     summary: Lấy chi tiết một booking
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID booking
 *     responses:
 *       200:
 *         description: Lấy chi tiết booking thành công
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy booking
 *       500:
 *         description: Lỗi server
 */
exports.getBookingDetails = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Fetching details for booking ${id}`);

    const booking = await Booking.findById(id).populate([
      {
        path: "user",
        select: "name email phone",
      },
      {
        path: "room",
        select: "roomType roomNumber price amenities hotelId images",
        populate: {
          path: "hotelId",
          select: "name address city images rating",
        },
      },
      {
        path: "voucher",
        select: "code discount discountType expiryDate",
      },
      {
        path: "paymentId",
        select: "amount transactionId status method createdAt updatedAt",
      },
    ]);

    if (!booking) {
      console.log(`Booking ${id} not found`);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đặt phòng",
      });
    }

    // Kiểm tra quyền truy cập
    const isOwner = booking.user && booking.user._id.toString() === req.user.id;
    const isAdmin = req.user.role === "admin";
    const isHotelOwner = req.user.role === "partner";

    // Kiểm tra nếu là chủ khách sạn thì có sở hữu khách sạn chứa phòng này không
    let hasHotelOwnerAccess = false;
    if (isHotelOwner && booking.room && booking.room.hotelId) {
      const hotels = await Hotel.find({ ownerId: req.user.id }).select("_id");
      const hotelIds = hotels.map((hotel) => hotel._id.toString());
      hasHotelOwnerAccess = hotelIds.includes(
        booking.room.hotelId._id.toString()
      );
    }

    if (!isOwner && !isAdmin && !hasHotelOwnerAccess) {
      console.log(`User ${req.user.id} not authorized to view booking ${id}`);
      return res.status(403).json({
        success: false,
        message: "Không có quyền truy cập thông tin đặt phòng này",
      });
    }

    console.log(`Successfully fetched booking ${id}`);

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error(`Error fetching booking details: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin đặt phòng",
    });
  }
};
/**
 * @swagger
 * /api/bookings/my-hotels:
 *   get:
 *     summary: Lấy danh sách booking của khách sạn của chủ khách sạn đang đăng nhập
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Lọc theo trạng thái booking
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sắp xếp
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng mỗi trang
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *         description: Lọc theo khách sạn
 *     responses:
 *       200:
 *         description: Lấy danh sách booking thành công
 *       500:
 *         description: Lỗi server
 */
exports.getMyHotelBookings = async (req, res) => {
  try {
    const {
      status,
      startDate,
      endDate,
      sort = "-createdAt",
      page = 1,
      limit = 10,
      hotelId,
    } = req.query;

    console.log(`Hotel owner ${req.user.id} fetching their hotel bookings`);
    console.log(
      `Query params: status=${status}, startDate=${startDate}, endDate=${endDate}, sort=${sort}, page=${page}, limit=${limit}, hotelId=${hotelId}`
    );

    // Tìm tất cả khách sạn thuộc sở hữu của chủ khách sạn đang đăng nhập
    let hotelIds = [];

    if (hotelId) {
      // Nếu hotelId được chỉ định, kiểm tra xem người dùng có sở hữu khách sạn đó không
      const hotel = await Hotel.findOne({
        _id: hotelId,
        ownerId: req.user.id,
      });

      if (!hotel) {
        return res.status(403).json({
          success: false,
          message:
            "Bạn không sở hữu khách sạn này hoặc khách sạn không tồn tại",
        });
      }

      hotelIds.push(hotel._id);
    } else {
      // Nếu không có hotelId, lấy tất cả khách sạn của chủ
      const hotels = await Hotel.find({ ownerId: req.user.id }).select("_id");
      hotelIds = hotels.map((hotel) => hotel._id);
    }

    if (hotelIds.length === 0) {
      console.log(`Hotel owner ${req.user.id} doesn't own any hotels`);
      return res.status(200).json({
        success: true,
        message: "Bạn chưa có khách sạn nào",
        pagination: {
          total: 0,
          currentPage: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: 0,
        },
        data: [],
      });
    }

    console.log(`Found ${hotelIds.length} hotels owned by user ${req.user.id}`);

    // Tìm tất cả phòng thuộc về các khách sạn này
    const rooms = await Room.find({ hotelId: { $in: hotelIds } }).select(
      "_id hotelId"
    );
    const roomIds = rooms.map((room) => room._id);

    console.log(`Found ${roomIds.length} rooms in these hotels`);

    if (roomIds.length === 0) {
      console.log(`No rooms found in the hotels owned by user ${req.user.id}`);
      return res.status(200).json({
        success: true,
        message: "Khách sạn của bạn chưa có phòng nào",
        pagination: {
          total: 0,
          currentPage: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: 0,
        },
        data: [],
      });
    }

    // Xây dựng query để lọc booking
    const query = { room: { $in: roomIds } };

    // Áp dụng các bộ lọc (nếu có)
    if (
      status &&
      ["pending", "confirmed", "cancelled", "completed"].includes(status)
    ) {
      query.status = status;
    }

    // Áp dụng bộ lọc theo thời gian
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.$or = [
          {
            checkIn: { $gte: start, $lte: end },
          },
          {
            checkOut: { $gte: start, $lte: end },
          },
          {
            $and: [{ checkIn: { $lte: start } }, { checkOut: { $gte: end } }],
          },
        ];
      }
    }

    console.log(`Applying query filters: ${JSON.stringify(query)}`);

    // Tính tổng số booking phù hợp với bộ lọc
    const total = await Booking.countDocuments(query);

    // Thiết lập phân trang
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;

    // Thực hiện truy vấn với phân trang và sắp xếp
    const bookings = await Booking.find(query)
      .populate([
        {
          path: "user",
          select: "name email phone",
        },
        {
          path: "room",
          select: "roomType roomNumber price hotelId",
          populate: {
            path: "hotelId",
            select: "name address city",
          },
        },
        {
          path: "voucher",
          select: "code discount discountType",
        },
        {
          path: "paymentId",
          select: "amount transactionId status method",
        },
      ])
      .sort(sort)
      .skip(startIndex)
      .limit(limitNum);

    console.log(
      `Found ${bookings.length} bookings for hotels owned by user ${req.user.id}`
    );

    // Thống kê nhanh
    const stats = {
      totalBookings: total,
      pendingBookings: await Booking.countDocuments({
        ...query,
        status: "pending",
      }),
      confirmedBookings: await Booking.countDocuments({
        ...query,
        status: "confirmed",
      }),
      cancelledBookings: await Booking.countDocuments({
        ...query,
        status: "cancelled",
      }),
      completedBookings: await Booking.countDocuments({
        ...query,
        status: "completed",
      }),
      totalRevenue: await Booking.aggregate([
        { $match: { ...query, status: { $in: ["confirmed", "completed"] } } },
        { $group: { _id: null, total: { $sum: "$finalPrice" } } },
      ]).then((result) => (result.length > 0 ? result[0].total : 0)),
    };

    // Thông tin phân trang
    const pagination = {
      total,
      currentPage: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };

    res.status(200).json({
      success: true,
      pagination,
      stats,
      data: bookings,
    });
  } catch (error) {
    console.error(`Error fetching hotel owner bookings: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách đặt phòng của khách sạn",
    });
  }
};
