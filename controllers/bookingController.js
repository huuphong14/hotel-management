const Booking = require('../models/Booking');
const Room = require('../models/Room');
const User = require('../models/User');
const Voucher = require('../models/Voucher');
const NotificationService = require('../services/notificationService');
const sendEmail = require('../utils/sendEmail');
const ZaloPayService = require('../services/zaloPayService')
const VNPayService = require('../services/vnPayService');
const Payment = require('../models/Payment');

// @desc    Tạo booking mới
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
  try {
    console.log("Received booking request:", req.body);

    const {
      roomId,
      checkIn,
      checkOut,
      voucherId,
      paymentMethod = 'zalopay', // Default payment method
      // New fields for contact information
      bookingFor = 'self', // 'self' or 'other'
      contactInfo = {}, // name, email, phone of booking person
      guestInfo = {}, // name, email, phone of guest (if bookingFor === 'other')
      specialRequests = {} // earlyCheckIn, lateCheckOut, additionalRequests
    } = req.body;

    // Validate contact information
    if (!contactInfo.name || !contactInfo.email || !contactInfo.phone) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin liên hệ'
      });
    }

    // Validate guest information if booking for someone else
    if (bookingFor === 'other' && (!guestInfo.name || !guestInfo.phone)) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp tên và số điện thoại của người lưu trú'
      });
    }

    function isValidCheckInDate(checkInDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Đặt giờ về 00:00:00

      const checkInDateOnly = new Date(checkInDate);
      checkInDateOnly.setHours(0, 0, 0, 0); // Đặt giờ về 00:00:00

      return checkInDateOnly >= today;
    }

    console.log("Parsing check-in and check-out dates...");
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    // Đặt giờ cố định là 14:00 (giờ check-in tiêu chuẩn) theo giờ địa phương
    checkInDate.setHours(14, 0, 0, 0);
    checkOutDate.setHours(12, 0, 0, 0); // check-out tiêu chuẩn là 12:00

    // Kiểm tra ngày check-in
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset giờ về 00:00:00

    if (checkInDate < today) {
      console.warn("Invalid check-in date:", checkInDate);
      return res.status(400).json({
        success: false,
        message: 'Ngày check-in không hợp lệ, vui lòng chọn từ ngày hôm nay trở đi'
      });
    }

    // Kiểm tra ngày check-out phải sau ngày check-in
    if (checkOutDate <= checkInDate) {
      console.warn("Invalid check-out date:", checkOutDate);
      return res.status(400).json({
        success: false,
        message: 'Ngày check-out phải sau ngày check-in'
      });
    }

    console.log("Fetching room details for roomId:", roomId);
    // Đảm bảo lấy thông tin chi tiết của phòng và thông tin khách sạn liên quan
    const room = await Room.findById(roomId).populate('hotelId');
    if (!room) {
      console.warn("Room not found:", roomId);
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    console.log("Checking room availability...");
    const isAvailable = await checkRoomAvailability(roomId, checkInDate, checkOutDate);
    if (!isAvailable) {
      console.warn("Room is not available for the selected dates.");
      return res.status(400).json({
        success: false,
        message: 'Phòng không có sẵn trong thời gian này'
      });
    }

    const numberOfDays = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    const originalPrice = room.price * numberOfDays;
    console.log(`Calculated booking price: ${originalPrice} for ${numberOfDays} days`);

    let discountAmount = 0;
    let finalPrice = originalPrice;
    let usedVoucher = null;

    if (voucherId) {
      console.log("Checking voucher:", voucherId);
      const voucher = await Voucher.findOne({
        _id: voucherId,
        status: 'active',
        type: 'room'
      });

      if (!voucher || !voucher.isValid(originalPrice)) {
        console.warn("Invalid or inapplicable voucher:", voucherId);
        return res.status(400).json({
          success: false,
          message: 'Voucher không hợp lệ'
        });
      }

      discountAmount = voucher.calculateDiscount(originalPrice);
      finalPrice = originalPrice - discountAmount;
      usedVoucher = voucher;

      console.log(`Voucher applied: ${voucher.code}, discount: ${discountAmount}`);

      voucher.usageCount += 1;
      if (voucher.usageLimit && voucher.usageCount >= voucher.usageLimit) {
        voucher.status = 'inactive';
      }
      await voucher.save();
    }

    console.log("Creating booking record...");
    const booking = await Booking.create({
      user: req.user.id,
      room: roomId,
      // Add new contact and request details
      bookingFor,
      contactInfo,
      guestInfo: bookingFor === 'other' ? guestInfo : undefined,
      specialRequests,
      // Existing fields
      checkIn: checkInDate,
      checkOut: checkOutDate,
      voucher: usedVoucher ? usedVoucher._id : null,
      originalPrice,
      discountAmount,
      finalPrice,
      status: 'pending',
      paymentMethod
    });

    console.log("Populating booking details...");
    await booking.populate([
      { path: 'voucher', select: 'code discount discountType' }
    ]);

    console.log("Creating booking notification...");
    await NotificationService.createBookingNotification(booking);

    // Lấy tên khách sạn từ thông tin phòng đã populate
    const hotelName = room.hotelId ? room.hotelId.name : 'Khách sạn';

    console.log("Sending confirmation email...");
    // Enhanced email message with contact information and special requests
    const message = `
      <h1>Xác nhận đặt phòng</h1>
      <p>Thông tin đặt phòng:</p>
      <ul>
        <li>Khách sạn: ${hotelName}</li>
        <li>Loại phòng: ${room.roomType}</li>
        <li>Ngày check-in: ${checkIn}</li>
        <li>Ngày check-out: ${checkOut}</li>
        <li>Số đêm: ${numberOfDays}</li>
        <li>Giá gốc: ${originalPrice.toLocaleString()}đ</li>
        ${usedVoucher ? `<li>Mã giảm giá: ${usedVoucher.code}</li>` : ''}
        ${discountAmount > 0 ? `<li>Giảm giá: ${discountAmount.toLocaleString()}đ</li>` : ''}
        <li>Tổng thanh toán: ${finalPrice.toLocaleString()}đ</li>
        <li>Phương thức thanh toán: ${paymentMethod === 'zalopay' ? 'ZaloPay' : 'VNPay'}</li>
      </ul>
      
      <h2>Thông tin liên hệ:</h2>
      <ul>
        <li>Tên người đặt: ${contactInfo.name}</li>
        <li>Email: ${contactInfo.email}</li>
        <li>Số điện thoại: ${contactInfo.phone}</li>
      </ul>
      
      ${bookingFor === 'other' ? `
        <h2>Thông tin người lưu trú:</h2>
        <ul>
          <li>Tên: ${guestInfo.name}</li>
          <li>Email: ${guestInfo.email || 'Không có'}</li>
          <li>Số điện thoại: ${guestInfo.phone}</li>
        </ul>
      ` : ''}
      
      ${(specialRequests.earlyCheckIn || specialRequests.lateCheckOut || specialRequests.additionalRequests) ?
        `<h2>Yêu cầu đặc biệt:</h2>
        <ul>
          ${specialRequests.earlyCheckIn ? '<li>Yêu cầu check-in sớm</li>' : ''}
          ${specialRequests.lateCheckOut ? '<li>Yêu cầu check-out muộn</li>' : ''}
          ${specialRequests.additionalRequests ? `<li>Yêu cầu khác: ${specialRequests.additionalRequests}</li>` : ''}
        </ul>` : ''
      }
      
      <p>Trạng thái: Chờ xác nhận</p>
    `;

    await sendEmail({
      email: contactInfo.email, // Send to the contact email provided
      subject: 'Xác nhận đặt phòng',
      message
    });

    // Lựa chọn cổng thanh toán
    let paymentUrl;
    if (paymentMethod === 'vnpay') {
      console.log("Generating VNPay payment URL...");
      paymentUrl = await VNPayService.createPaymentUrl(booking);
    } else {
      console.log("Generating ZaloPay payment URL...");
      paymentUrl = await ZaloPayService.createPaymentUrl(booking);
    }
    console.log("Payment URL generated:", paymentUrl);

    console.log("Booking created successfully:", booking._id);
    res.status(201).json({
      success: true,
      data: booking,
      paymentUrl: paymentUrl.payUrl
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// Phương thức xác nhận thanh toán
exports.confirmPayment = async (req, res) => {
  try {
    const { transactionId, paymentMethod = 'zalopay' } = req.body;
    let result;

    if (paymentMethod === 'vnpay') {
      result = await VNPayService.verifyPayment(transactionId);
    } else {
      result = await ZaloPayService.verifyPayment(transactionId);
    }

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Thanh toán thành công',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Thanh toán không thành công',
        data: result
      });
    }
  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).json({
      success: false,
      message: 'Lỗi xác nhận thanh toán'
    });
  }
};

// @desc    Lấy danh sách booking của user
// @route   GET /api/bookings
// @access  Private
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate('room')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      data: bookings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Cập nhật trạng thái booking
// @route   PUT /api/bookings/:id/status
// @access  Private (Admin/Hotel Owner)
exports.updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy booking'
      });
    }

    // Kiểm tra quyền cập nhật
    if (req.user.role !== 'admin' && req.user.role !== 'hotel_owner') {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền cập nhật booking'
      });
    }

    // Cập nhật trạng thái
    booking.status = status;
    await booking.save();

    // Cập nhật trạng thái phòng nếu cần
    if (status === 'cancelled' || status === 'completed') {
      const room = await Room.findById(booking.room);
      room.status = 'available';
      await room.save();
    }

    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Kiểm tra voucher cho đặt phòng
// @route   POST /api/bookings/check-voucher
// @access  Private
exports.checkVoucher = async (req, res) => {
  try {
    const { roomId, checkIn, checkOut, voucherCode } = req.body;

    // Kiểm tra phòng
    const room = await Room.findById(roomId).populate('hotel');
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    // Tính giá gốc
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const numberOfDays = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    const originalPrice = room.price * numberOfDays;

    // Kiểm tra voucher
    const voucher = await Voucher.findOne({
      code: voucherCode.toUpperCase(),
      status: 'active',
      type: 'room' // Chỉ lấy voucher cho phòng
    });

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Mã voucher không hợp lệ'
      });
    }

    if (!voucher.isValid(originalPrice)) {
      return res.status(400).json({
        success: false,
        message: `Không thể áp dụng voucher này. Giá trị đơn tối thiểu: ${voucher.minOrderValue}đ`
      });
    }

    const discountAmount = voucher.calculateDiscount(originalPrice);
    const finalPrice = originalPrice - discountAmount;

    res.status(200).json({
      success: true,
      data: {
        originalPrice,
        discountAmount,
        finalPrice,
        voucherId: voucher._id,
        voucherInfo: {
          code: voucher.code,
          discountType: voucher.discountType,
          discount: voucher.discount,
          expiryDate: voucher.expiryDate
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// Hàm kiểm tra phòng có sẵn
async function checkRoomAvailability(roomId, checkIn, checkOut) {
  // Đảm bảo đã đặt giờ check-in và check-out
  const checkInTime = new Date(checkIn);
  checkInTime.setHours(14, 0, 0, 0);  // check-in 14:00
  
  const checkOutTime = new Date(checkOut);
  checkOutTime.setHours(12, 0, 0, 0);  // check-out 12:00
  
  const existingBooking = await Booking.findOne({
    room: roomId,
    status: { $ne: 'cancelled' },
    $or: [
      {
        checkIn: { $lt: checkOutTime },
        checkOut: { $gt: checkInTime }
      }
    ]
  });

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
      return_message: 'Lỗi xử lý callback'
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
    res.redirect('/payment-error');
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
    res.redirect('/payment-error');
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
      return_message: 'Lỗi xử lý callback'
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
        message: 'Không tìm thấy giao dịch'
      });
    }

    // Kiểm tra trạng thái hoàn tiền
    if (!payment.refundTransactionId) {
      return res.json({
        success: false,
        message: 'Chưa có yêu cầu hoàn tiền cho giao dịch này',
        payment: {
          transactionId: payment.transactionId,
          status: payment.status
        }
      });
    }

    // Kiểm tra trạng thái hoàn tiền
    const refundStatus = await VNPayService.checkRefundStatus(payment.refundTransactionId);

    return res.json(refundStatus);
  } catch (error) {
    console.error('Lỗi kiểm tra trạng thái hoàn tiền:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi kiểm tra trạng thái hoàn tiền'
    });
  }
};

// Cập nhật phương thức cancelBooking để sử dụng các tính năng mới
exports.cancelBooking = async (req, res) => {
  try {
    console.log(`=== BẮT ĐẦU HỦY BOOKING ${req.params.id} ===`);
    console.log(`Người dùng ${req.user.id} yêu cầu hủy booking ${req.params.id}`);

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      console.log(`Không tìm thấy booking với ID ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy booking'
      });
    }

    console.log(`Thông tin booking tìm thấy: ${JSON.stringify({
      id: booking._id,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      userId: booking.user
    })}`);

    // Kiểm tra quyền hủy booking
    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      console.log(`Người dùng ${req.user.id} không có quyền hủy booking ${booking._id}`);
      return res.status(403).json({
        success: false,
        message: 'Không có quyền hủy booking này'
      });
    }

    // Kiểm tra trạng thái booking có thể hủy
    if (!['confirmed', 'pending'].includes(booking.status)) {
      console.log(`Không thể hủy booking ${booking._id} với trạng thái ${booking.status}`);
      return res.status(400).json({
        success: false,
        message: 'Không thể hủy booking với trạng thái hiện tại'
      });
    }

    // Kiểm tra thời gian check-in so với thời gian hiện tại
    const now = new Date();
    const checkInDate = new Date(booking.checkIn);
    const timeUntilCheckIn = checkInDate - now;
    const hoursUntilCheckIn = timeUntilCheckIn / (1000 * 60 * 60);

    console.log(`Thời gian còn lại đến check-in: ${hoursUntilCheckIn.toFixed(2)} giờ`);

    // Kiểm tra chính sách hủy phòng (Ví dụ: chỉ được hủy trước 24h)
    const CANCELLATION_POLICY_HOURS = 24;
    if (hoursUntilCheckIn < CANCELLATION_POLICY_HOURS) {
      console.log(`Không thể hủy booking ${booking._id}, còn ít hơn ${CANCELLATION_POLICY_HOURS} giờ đến check-in`);
      return res.status(400).json({
        success: false,
        message: `Không thể hủy booking khi còn ít hơn ${CANCELLATION_POLICY_HOURS} giờ đến thời gian check-in`
      });
    }

    // Xử lý theo trạng thái thanh toán
    if (booking.paymentStatus === 'paid') {
      console.log(`Booking ${booking._id} đã được thanh toán, tiến hành hoàn tiền`);

      try {
        let refundResult = false;

        // Xử lý hoàn tiền dựa trên phương thức thanh toán
        if (booking.paymentMethod === 'zalopay') {
          refundResult = await ZaloPayService.refundPayment(booking);
        } else if (booking.paymentMethod === 'vnpay') {
          refundResult = await VNPayService.refundPayment(booking);
        } else {
          console.error(`Không hỗ trợ hoàn tiền cho phương thức thanh toán: ${booking.paymentMethod}`);
          return res.status(400).json({
            success: false,
            message: 'Không hỗ trợ hoàn tiền cho phương thức thanh toán này'
          });
        }

        console.log(`Kết quả hoàn tiền: ${refundResult ? 'Thành công' : 'Thất bại'}`);

        if (!refundResult) {
          return res.status(400).json({
            success: false,
            message: 'Không thể hoàn tiền, vui lòng liên hệ hỗ trợ'
          });
        }

        // Các service đã cập nhật trạng thái booking
        res.status(200).json({
          success: true,
          message: 'Hủy booking và hoàn tiền thành công'
        });
      } catch (refundError) {
        console.error(`Lỗi hoàn tiền: ${refundError.message}`);
        return res.status(500).json({
          success: false,
          message: `Lỗi hoàn tiền: ${refundError.message}`
        });
      }
    } else {
      // Nếu chưa thanh toán, chỉ cần cập nhật trạng thái
      console.log(`Booking ${booking._id} chưa thanh toán, chỉ cập nhật trạng thái`);

      booking.status = 'cancelled';
      booking.cancelledAt = new Date();
      booking.cancellationReason = 'user_requested';
      await booking.save();

      console.log(`Đã cập nhật booking ${booking._id} thành trạng thái 'cancelled'`);

      // Gửi thông báo hủy
      await NotificationService.createNotification({
        user: booking.user,
        title: 'Đặt phòng đã hủy',
        message: `Đơn đặt phòng #${booking._id} đã được hủy thành công`,
        type: 'booking',
        relatedModel: 'Booking',
        relatedId: booking._id
      });

      console.log(`Đã gửi thông báo hủy booking cho người dùng ${booking.user}`);

      res.status(200).json({
        success: true,
        message: 'Hủy booking thành công'
      });
    }

    console.log(`=== KẾT THÚC HỦY BOOKING ${req.params.id} ===`);
  } catch (error) {
    console.error(`Lỗi hủy booking: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi hủy booking'
    });
  }
};
