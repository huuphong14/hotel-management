const Room = require('../models/Room');
const Hotel = require('../models/Hotel');

// @desc    Tạo phòng mới cho khách sạn
// @route   POST /api/hotels/:hotelId/rooms
// @access  Private/Hotel Owner, Admin
exports.createRoom = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.hotelId);

    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách sạn' });
    }

    // Kiểm tra quyền
    if (hotel.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thêm phòng' });
    }

    req.body.hotel = req.params.hotelId;
    const room = await Room.create(req.body);

    res.status(201).json({ success: true, data: room });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// @desc    Lấy danh sách phòng của khách sạn
// @route   GET /api/hotels/:hotelId/rooms
// @access  Public
exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ hotel: req.params.hotelId });

    res.status(200).json({ success: true, count: rooms.length, data: rooms });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// @desc    Lấy thông tin một phòng
// @route   GET /api/rooms/:roomId
// @access  Public
exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId).populate('hotel', 'name address');

    if (!room) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng' });
    }

    res.status(200).json({ success: true, data: room });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// @desc    Cập nhật thông tin phòng
// @route   PUT /api/rooms/:roomId
// @access  Private/Hotel Owner, Admin
exports.updateRoom = async (req, res) => {
  try {
    let room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng' });
    }

    const hotel = await Hotel.findById(room.hotel);

    // Kiểm tra quyền
    if (hotel.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật phòng này' });
    }

    room = await Room.findByIdAndUpdate(req.params.roomId, req.body, { new: true, runValidators: true });

    res.status(200).json({ success: true, data: room });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// @desc    Xóa phòng
// @route   DELETE /api/rooms/:roomId
// @access  Private/Hotel Owner, Admin
exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng' });
    }

    const hotel = await Hotel.findById(room.hotel);

    // Kiểm tra quyền
    if (hotel.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa phòng này' });
    }

    await room.deleteOne();

    res.status(200).json({ success: true, message: 'Phòng đã được xóa' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
