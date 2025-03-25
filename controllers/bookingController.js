const Booking = require('../models/Booking');
const Room = require('../models/Room');
const User = require('../models/User');
const Voucher = require('../models/Voucher');
const NotificationService = require('../services/notificationService');
const sendEmail = require('../utils/sendEmail');

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

    console.log("Booking created successfully:", booking._id);
    res.status(201).json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
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

// @desc    Hủy booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy booking'
      });
    }

    // Kiểm tra quyền hủy booking
    if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền hủy booking này'
      });
    }

    // Kiểm tra trạng thái booking có thể hủy
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Không thể hủy booking này'
      });
    }

    // Cập nhật trạng thái booking
    booking.status = 'cancelled';
    await booking.save();

    // Cập nhật trạng thái phòng
    const room = await Room.findById(booking.roomId);
    room.status = 'available';
    await room.save();

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