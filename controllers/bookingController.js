const Booking = require('../models/Booking');
const Room = require('../models/Room');
const User = require('../models/User');

// @desc    Tạo booking mới
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
  try {
    const { roomId, checkInDate, checkOutDate } = req.body;

    // Kiểm tra phòng có tồn tại
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    // Kiểm tra phòng có available không
    if (room.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'Phòng không khả dụng'
      });
    }

    // Kiểm tra xem phòng đã được đặt trong khoảng thời gian này chưa
    const existingBooking = await Booking.findOne({
      roomId,
      status: { $in: ['pending', 'confirmed', 'checked-in'] },
      $or: [
        {
          checkInDate: { $lte: checkOutDate },
          checkOutDate: { $gte: checkInDate }
        }
      ]
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: 'Phòng đã được đặt trong khoảng thời gian này'
      });
    }

    // Tính số ngày
    const days = Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24));
    
    // Tính tổng tiền
    const totalPrice = days * room.price;

    // Tạo booking mới
    const booking = await Booking.create({
      userId: req.user.id,
      roomId,
      checkInDate,
      checkOutDate,
      totalPrice,
      status: 'pending',
      paymentStatus: 'pending'
    });

    // Cập nhật trạng thái phòng
    room.status = 'booked';
    await room.save();

    res.status(201).json({
      success: true,
      data: booking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server'
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