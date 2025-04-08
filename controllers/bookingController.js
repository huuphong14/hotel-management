const Booking = require('../models/Booking');
const Room = require('../models/Room');
const User = require('../models/User');
const Voucher = require('../models/Voucher');
const NotificationService = require('../services/notificationService');
const sendEmail = require('../utils/sendEmail');
const ZaloPayService = require('../services/zaloPayService')

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
      voucherId
    } = req.body;

    console.log("Parsing check-in and check-out dates...");
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (checkInDate < new Date()) {
      console.warn("Invalid check-in date:", checkInDate);
      return res.status(400).json({
        success: false,
        message: 'Ngày check-in không hợp lệ'
      });
    }

    console.log("Fetching room details for roomId:", roomId);
    const room = await Room.findById(roomId);
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
      checkIn: checkInDate,
      checkOut: checkOutDate,
      voucher: usedVoucher ? usedVoucher._id : null,
      originalPrice,
      discountAmount,
      finalPrice,
      status: 'pending'
    });

    console.log("Populating booking details...");
    await booking.populate([
      { path: 'voucher', select: 'code discount discountType' }
    ]);

    console.log("Creating booking notification...");
    await NotificationService.createBookingNotification(booking);

    console.log("Sending confirmation email...");
    const message = `
      <h1>Xác nhận đặt phòng</h1>
      <p>Thông tin đặt phòng:</p>
      <ul>
        <li>Tên phòng: ${room.name || 'Không xác định'}</li>
        <li>Loại phòng: ${room.type || 'Không xác định'}</li>
        <li>Ngày check-in: ${checkIn}</li>
        <li>Ngày check-out: ${checkOut}</li>
        <li>Số đêm: ${numberOfDays}</li>
        <li>Giá gốc: ${originalPrice.toLocaleString()}đ</li>
        ${usedVoucher ? `<li>Mã giảm giá: ${usedVoucher.code}</li>` : ''}
        ${discountAmount > 0 ? `<li>Giảm giá: ${discountAmount.toLocaleString()}đ</li>` : ''}
        <li>Tổng thanh toán: ${finalPrice.toLocaleString()}đ</li>
      </ul>
      <p>Trạng thái: Chờ xác nhận</p>
    `;

    await sendEmail({
      email: req.user.email,
      subject: 'Xác nhận đặt phòng',
      message
    });

    const paymentUrl = await ZaloPayService.createPaymentUrl(booking);
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
    const paymentData = req.body;
    const result = await ZaloPayService.verifyPayment(paymentData);

    if (result) {
      res.status(200).json({
        success: true,
        message: 'Thanh toán thành công'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Thanh toán không thành công'
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
    const bookings = await Booking.find({ userId: req.user.id })
      .populate('roomId')
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
      const room = await Room.findById(booking.roomId);
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
  const existingBooking = await Booking.findOne({
    room: roomId,
    status: { $ne: 'cancelled' },
    $or: [
      {
        checkIn: { $lte: checkOut },
        checkOut: { $gte: checkIn }
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
        const refundResult = await ZaloPayService.refundPayment(booking);
        console.log(`Kết quả hoàn tiền: ${refundResult ? 'Thành công' : 'Thất bại'}`);

        if (!refundResult) {
          return res.status(400).json({
            success: false,
            message: 'Không thể hoàn tiền, vui lòng liên hệ hỗ trợ'
          });
        }
        
        // ZaloPayService.refundPayment đã cập nhật trạng thái booking
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