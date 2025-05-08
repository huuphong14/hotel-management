const Booking = require('../models/Booking');
const Room = require('../models/Room');
const User = require('../models/User');
const Hotel = require('../models/Hotel'); 
const Voucher = require('../models/Voucher');
const NotificationService = require('../services/notificationService');
const sendEmail = require('../utils/sendEmail');
const ZaloPayService = require('../services/zaloPayService')
const VNPayService = require('../services/vnPayService');
const Payment = require('../models/Payment');
const mongoose = require('mongoose'); 

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
        //startDate: { $lte: now } 
      });

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
    console.log("=== BẮT ĐẦU KIỂM TRA VOUCHER ===");
    const { roomId, checkIn, checkOut, voucherCode } = req.body;
    console.log(`Thông tin yêu cầu: roomId=${roomId}, checkIn=${checkIn}, checkOut=${checkOut}, voucherCode=${voucherCode}`);

    // Kiểm tra phòng
    console.log(`Tìm thông tin phòng với ID: ${roomId}`);
    const room = await Room.findById(roomId).populate('hotel');
    if (!room) {
      console.log(`Không tìm thấy phòng với ID ${roomId}`);
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }
    console.log(`Tìm thấy phòng: ${room.roomType}, giá: ${room.price}đ/đêm`);

    // Tính giá gốc
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const numberOfDays = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    console.log(`Số ngày lưu trú: ${numberOfDays}`);
    const originalPrice = room.price * numberOfDays;
    console.log(`Giá gốc đặt phòng: ${originalPrice}đ`);

    // Kiểm tra voucher
    console.log(`Tìm voucher với mã: ${voucherCode.toUpperCase()}`);
    const voucher = await Voucher.findOne({
      code: voucherCode.toUpperCase(),
      status: 'active',
      type: 'room' // Chỉ lấy voucher cho phòng
    });

    if (!voucher) {
      console.log(`Không tìm thấy voucher với mã ${voucherCode.toUpperCase()} hoặc voucher không hoạt động/không áp dụng cho phòng`);
      return res.status(400).json({
        success: false,
        message: 'Mã voucher không hợp lệ'
      });
    }

    console.log(`Tìm thấy voucher: ${JSON.stringify({
      code: voucher.code,
      discount: voucher.discount,
      type: voucher.discountType,
      minOrderValue: voucher.minOrderValue,
      expiryDate: voucher.expiryDate,
      usageCount: voucher.usageCount,
      usageLimit: voucher.usageLimit
    })}`);

    // Kiểm tra chi tiết tính hợp lệ của voucher
    console.log(`Kiểm tra tính hợp lệ của voucher...`);
    
    // Kiểm tra hạn sử dụng
    const now = new Date();
    if (voucher.expiryDate && new Date(voucher.expiryDate) < now) {
      console.log(`Voucher đã hết hạn. Hạn sử dụng: ${voucher.expiryDate}`);
      return res.status(400).json({
        success: false,
        message: 'Voucher đã hết hạn sử dụng'
      });
    }
    
    // Kiểm tra giới hạn sử dụng
    if (voucher.usageLimit && voucher.usageCount >= voucher.usageLimit) {
      console.log(`Voucher đã đạt giới hạn sử dụng. Đã sử dụng: ${voucher.usageCount}/${voucher.usageLimit}`);
      return res.status(400).json({
        success: false,
        message: 'Voucher đã đạt giới hạn sử dụng'
      });
    }

    // Kiểm tra giá trị đơn hàng tối thiểu
    const isValidForPrice = voucher.isValid(originalPrice);
    console.log(`Kiểm tra giá trị đơn tối thiểu: ${isValidForPrice ? 'Đạt' : 'Không đạt'}`);
    console.log(`Giá trị đơn: ${originalPrice}đ, Giá trị tối thiểu yêu cầu: ${voucher.minOrderValue}đ`);
    
    if (!isValidForPrice) {
      return res.status(400).json({
        success: false,
        message: `Không thể áp dụng voucher này. Giá trị đơn tối thiểu: ${voucher.minOrderValue}đ`
      });
    }

    // Tính toán giảm giá
    const discountAmount = voucher.calculateDiscount(originalPrice);
    console.log(`Giảm giá: ${discountAmount}đ (${voucher.discountType === 'percentage' ? voucher.discount + '%' : voucher.discount + 'đ'})`);
    const finalPrice = originalPrice - discountAmount;
    console.log(`Giá cuối cùng sau khi áp dụng voucher: ${finalPrice}đ`);

    console.log("=== KẾT THÚC KIỂM TRA VOUCHER - THÀNH CÔNG ===");
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
    console.error(`=== LỖI KIỂM TRA VOUCHER: ${error.message} ===`);
    console.error(error.stack);
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
// @desc    Lấy toàn bộ booking của một khách sạn
// @route   GET /api/bookings/hotel/:hotelId
// @access  Private (Admin/Hotel Owner)
exports.getHotelBookings = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { status, startDate, endDate, sort = '-createdAt', page = 1, limit = 10 } = req.query;
    
    console.log(`Fetching bookings for hotel ${hotelId}`);
    console.log(`Query params: status=${status}, startDate=${startDate}, endDate=${endDate}, sort=${sort}, page=${page}, limit=${limit}`);
    
    // Xác thực quyền truy cập (chỉ admin hoặc chủ khách sạn)
    if (req.user.role !== 'admin' && req.user.role !== 'hotel_owner') {
      console.log(`User ${req.user.id} with role ${req.user.role} not authorized to view hotel bookings`);
      return res.status(403).json({
        success: false,
        message: 'Không có quyền truy cập danh sách đặt phòng của khách sạn'
      });
    }
    
    // Nếu là chủ khách sạn, cần kiểm tra xem họ có sở hữu khách sạn này không
    if (req.user.role === 'hotel_owner') {
      // Lấy danh sách khách sạn thuộc quyền sở hữu của user
      const hotels = await Hotel.find({ owner: req.user.id }).select('_id');
      const hotelIds = hotels.map(hotel => hotel._id.toString());
      
      if (!hotelIds.includes(hotelId)) {
        console.log(`Hotel owner ${req.user.id} doesn't own hotel ${hotelId}`);
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xem đặt phòng của khách sạn này'
        });
      }
    }
    
    // Tạo query để lấy phòng thuộc về khách sạn
    const rooms = await Room.find({ hotelId }).select('_id');
    const roomIds = rooms.map(room => room._id);
    
    console.log(`Found ${roomIds.length} rooms for hotel ${hotelId}`);
    
    // Khởi tạo điều kiện lọc
    const query = { room: { $in: roomIds } };
    
    // Áp dụng bộ lọc theo trạng thái nếu có
    if (status && ['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      query.status = status;
    }
    
    // Áp dụng bộ lọc theo thời gian
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.$or = [
          { 
            checkIn: { $gte: start, $lte: end } 
          },
          { 
            checkOut: { $gte: start, $lte: end } 
          },
          {
            $and: [
              { checkIn: { $lte: start } },
              { checkOut: { $gte: end } }
            ]
          }
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
        { path: 'user', select: 'name email' },
        { path: 'room', select: 'roomType roomNumber price' },
        { path: 'voucher', select: 'code discount discountType' },
        { path: 'paymentId', select: 'amount transactionId status method' }
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
      totalPages: Math.ceil(total / limitNum)
    };
    
    res.status(200).json({
      success: true,
      pagination,
      data: bookings
    });
  } catch (error) {
    console.error(`Error fetching hotel bookings: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách đặt phòng của khách sạn'
    });
  }
};

// @desc    Lấy toàn bộ booking trong hệ thống (cho admin)
// @route   GET /api/bookings/all
// @access  Private (Admin only)
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
      sort = '-createdAt', 
      page = 1, 
      limit = 20 
    } = req.query;
    
    console.log(`Admin ${req.user.id} fetching all bookings`);
    console.log(`Query params: status=${status}, startDate=${startDate}, endDate=${endDate}, hotelId=${hotelId}, paymentStatus=${paymentStatus}, paymentMethod=${paymentMethod}, userId=${userId}`);
    
    // Chỉ admin mới có quyền truy cập
    if (req.user.role !== 'admin') {
      console.log(`User ${req.user.id} with role ${req.user.role} not authorized to view all bookings`);
      return res.status(403).json({
        success: false,
        message: 'Chỉ admin mới có quyền truy cập tất cả đặt phòng'
      });
    }
    
    // Khởi tạo điều kiện lọc
    const query = {};
    
    // Áp dụng các bộ lọc
    if (status && ['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      query.status = status;
    }
    
    if (paymentStatus && ['pending', 'paid', 'failed', 'refunded'].includes(paymentStatus)) {
      query.paymentStatus = paymentStatus;
    }
    
    if (paymentMethod && ['zalopay', 'vnpay', 'credit_card', 'paypal'].includes(paymentMethod)) {
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
            checkIn: { $gte: start, $lte: end } 
          },
          { 
            checkOut: { $gte: start, $lte: end } 
          },
          {
            $and: [
              { checkIn: { $lte: start } },
              { checkOut: { $gte: end } }
            ]
          }
        ];
      }
    }
    
    // Lọc theo khách sạn (cần join với bảng Room)
    let roomIds = [];
    if (hotelId) {
      try {
        const rooms = await Room.find({ hotelId: mongoose.Types.ObjectId(hotelId) }).select('_id');
        roomIds = rooms.map(room => room._id);
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
          path: 'user', 
          select: 'name email phone' 
        },
        { 
          path: 'room', 
          select: 'roomType roomNumber price hotelId', 
          populate: { 
            path: 'hotelId', 
            select: 'name address city' 
          } 
        },
        { 
          path: 'voucher', 
          select: 'code discount discountType expiryDate' 
        },
        { 
          path: 'paymentId', 
          select: 'amount transactionId status method createdAt updatedAt' 
        }
      ])
      .sort(sort)
      .skip(startIndex)
      .limit(limitNum);
    
    console.log(`Found ${bookings.length} bookings matching criteria`);
    
    // Tính toán thống kê nhanh
    const stats = {
      totalBookings: total,
      totalRevenue: await Booking.aggregate([
        { $match: { ...query, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$finalPrice' } } }
      ]).then(result => result.length > 0 ? result[0].total : 0),
      statusCounts: await Booking.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).then(result => result.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {})),
      paymentMethodCounts: await Booking.aggregate([
        { $match: query },
        { $group: { _id: '$paymentMethod', count: { $sum: 1 } } }
      ]).then(result => result.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}))
    };
    
    // Thông tin phân trang
    const pagination = {
      total,
      currentPage: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
    
    res.status(200).json({
      success: true,
      pagination,
      stats,
      data: bookings
    });
  } catch (error) {
    console.error(`Error fetching all bookings: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách đặt phòng'
    });
  }
};

// @desc    Lấy chi tiết một booking
// @route   GET /api/bookings/:id
// @access  Private (User/Admin/Hotel Owner)
exports.getBookingDetails = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Fetching details for booking ${id}`);
    
    const booking = await Booking.findById(id)
      .populate([
        { 
          path: 'user', 
          select: 'name email phone' 
        },
        { 
          path: 'room', 
          select: 'roomType roomNumber price amenities hotelId images', 
          populate: { 
            path: 'hotelId', 
            select: 'name address city images rating' 
          } 
        },
        { 
          path: 'voucher', 
          select: 'code discount discountType expiryDate' 
        },
        { 
          path: 'paymentId', 
          select: 'amount transactionId status method createdAt updatedAt' 
        }
      ]);
    
    if (!booking) {
      console.log(`Booking ${id} not found`);
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đặt phòng'
      });
    }
    
    // Kiểm tra quyền truy cập
    const isOwner = booking.user && booking.user._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isHotelOwner = req.user.role === 'hotel_owner';
    
    // Kiểm tra nếu là chủ khách sạn thì có sở hữu khách sạn chứa phòng này không
    let hasHotelOwnerAccess = false;
    if (isHotelOwner && booking.room && booking.room.hotelId) {
      const hotels = await Hotel.find({ owner: req.user.id }).select('_id');
      const hotelIds = hotels.map(hotel => hotel._id.toString());
      hasHotelOwnerAccess = hotelIds.includes(booking.room.hotelId._id.toString());
    }
    
    if (!isOwner && !isAdmin && !hasHotelOwnerAccess) {
      console.log(`User ${req.user.id} not authorized to view booking ${id}`);
      return res.status(403).json({
        success: false,
        message: 'Không có quyền truy cập thông tin đặt phòng này'
      });
    }
    
    console.log(`Successfully fetched booking ${id}`);
    
    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error(`Error fetching booking details: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thông tin đặt phòng'
    });
  }
};
// @desc    Lấy danh sách booking của khách sạn của chủ khách sạn đang đăng nhập
// @route   GET /api/bookings/my-hotels
// @access  Private (Hotel Owner)
exports.getMyHotelBookings = async (req, res) => {
  try {
    const { 
      status, 
      startDate, 
      endDate, 
      sort = '-createdAt', 
      page = 1, 
      limit = 10,
      hotelId
    } = req.query;
    
    console.log(`Hotel owner ${req.user.id} fetching their hotel bookings`);
    console.log(`Query params: status=${status}, startDate=${startDate}, endDate=${endDate}, sort=${sort}, page=${page}, limit=${limit}, hotelId=${hotelId}`);
    
    
    // Tìm tất cả khách sạn thuộc sở hữu của chủ khách sạn đang đăng nhập
    let hotelIds = [];
    
    if (hotelId) {
      // Nếu hotelId được chỉ định, kiểm tra xem người dùng có sở hữu khách sạn đó không
      const hotel = await Hotel.findOne({
        _id: hotelId,
        owner: req.user.id
      });
      
      if (!hotel) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không sở hữu khách sạn này hoặc khách sạn không tồn tại'
        });
      }
      
      hotelIds.push(hotel._id);
    } else {
      // Nếu không có hotelId, lấy tất cả khách sạn của chủ
      const hotels = await Hotel.find({ owner: req.user.id }).select('_id');
      hotelIds = hotels.map(hotel => hotel._id);
    }
    
    if (hotelIds.length === 0) {
      console.log(`Hotel owner ${req.user.id} doesn't own any hotels`);
      return res.status(200).json({
        success: true,
        message: 'Bạn chưa có khách sạn nào',
        pagination: {
          total: 0,
          currentPage: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: 0
        },
        data: []
      });
    }
    
    console.log(`Found ${hotelIds.length} hotels owned by user ${req.user.id}`);
    
    // Tìm tất cả phòng thuộc về các khách sạn này
    const rooms = await Room.find({ hotelId: { $in: hotelIds } }).select('_id hotelId');
    const roomIds = rooms.map(room => room._id);
    
    console.log(`Found ${roomIds.length} rooms in these hotels`);
    
    if (roomIds.length === 0) {
      console.log(`No rooms found in the hotels owned by user ${req.user.id}`);
      return res.status(200).json({
        success: true,
        message: 'Khách sạn của bạn chưa có phòng nào',
        pagination: {
          total: 0,
          currentPage: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: 0
        },
        data: []
      });
    }
    
    // Xây dựng query để lọc booking
    const query = { room: { $in: roomIds } };
    
    // Áp dụng các bộ lọc (nếu có)
    if (status && ['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      query.status = status;
    }
    
    // Áp dụng bộ lọc theo thời gian
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.$or = [
          { 
            checkIn: { $gte: start, $lte: end } 
          },
          { 
            checkOut: { $gte: start, $lte: end } 
          },
          {
            $and: [
              { checkIn: { $lte: start } },
              { checkOut: { $gte: end } }
            ]
          }
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
          path: 'user', 
          select: 'name email phone' 
        },
        { 
          path: 'room', 
          select: 'roomType roomNumber price hotelId', 
          populate: {
            path: 'hotelId',
            select: 'name address city'
          }
        },
        { 
          path: 'voucher', 
          select: 'code discount discountType' 
        },
        { 
          path: 'paymentId', 
          select: 'amount transactionId status method' 
        }
      ])
      .sort(sort)
      .skip(startIndex)
      .limit(limitNum);
    
    console.log(`Found ${bookings.length} bookings for hotels owned by user ${req.user.id}`);
    
    // Thống kê nhanh
    const stats = {
      totalBookings: total,
      pendingBookings: await Booking.countDocuments({ ...query, status: 'pending' }),
      confirmedBookings: await Booking.countDocuments({ ...query, status: 'confirmed' }),
      cancelledBookings: await Booking.countDocuments({ ...query, status: 'cancelled' }),
      completedBookings: await Booking.countDocuments({ ...query, status: 'completed' }),
      totalRevenue: await Booking.aggregate([
        { $match: { ...query, status: { $in: ['confirmed', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$finalPrice' } } }
      ]).then(result => result.length > 0 ? result[0].total : 0)
    };
    
    // Thông tin phân trang
    const pagination = {
      total,
      currentPage: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
    
    res.status(200).json({
      success: true,
      pagination,
      stats,
      data: bookings
    });
  } catch (error) {
    console.error(`Error fetching hotel owner bookings: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách đặt phòng của khách sạn'
    });
  }
};