const Room = require('../models/Room');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');

// @desc    Tạo phòng mới cho khách sạn
// @route   POST /api/hotels/:hotelId/rooms
// @access  Private/Hotel Owner
exports.createRoom = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.hotelId);

    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách sạn' });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thêm phòng' });
    }

    req.body.hotelId = req.params.hotelId;
    const room = await Room.create(req.body);

    res.status(201).json({ success: true, data: room });
  } catch (error) {
    console.error('Chi tiết lỗi:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// @desc    Lấy danh sách phòng của khách sạn
// @route   GET /api/rooms/hotel/:hotelId/rooms
// @access  Public
exports.getRooms = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { 
      minPrice, 
      maxPrice, 
      capacity, 
      available,
      sort = '-createdAt',
      page = 1,
      limit = 10
    } = req.query;

    // Xây dựng query
    const query = { hotelId };

    // Filter theo giá
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Filter theo sức chứa
    if (capacity) {
      query.capacity = Number(capacity);
    }

    // Filter theo trạng thái
    if (available === 'true') {
      query.isAvailable = true;
    }

    // Tính toán pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Thực hiện query với populate
    const rooms = await Room.find(query)
      .populate({
        path: 'hotelId',
        select: 'name address rating'
      })
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    // Đếm tổng số phòng thỏa mãn điều kiện
    const total = await Room.countDocuments(query);

    res.status(200).json({ 
      success: true, 
      count: rooms.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit))
      },
      data: rooms 
    });
  } catch (error) {
    console.error('Chi tiết lỗi:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server',
      error: error.message 
    });
  }
};

// @desc    Lấy thông tin chi tiết một phòng
// @route   GET /api/rooms/:id
// @access  Public
exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate({
        path: 'hotelId',
        select: 'name address rating amenities images contact'
      });

    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy phòng' 
      });
    }

    res.status(200).json({ 
      success: true, 
      data: room 
    });
  } catch (error) {
    console.error('Chi tiết lỗi:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server',
      error: error.message 
    });
  }
};

// @desc    Cập nhật thông tin phòng
// @route   PUT /api/rooms/:id
// @access  Private/Hotel Owner, Admin
exports.updateRoom = async (req, res) => {
  try {
    let room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy phòng' 
      });
    }

    const hotel = await Hotel.findById(room.hotelId);

    if (!hotel) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy thông tin khách sạn' 
      });
    }

    // Kiểm tra quyền (thêm role admin)
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Bạn không có quyền cập nhật phòng này' 
      });
    }

    // Validate dữ liệu cập nhật
    const allowedFields = ['name', 'type', 'price', 'capacity', 'description', 'amenities', 'images', 'isAvailable'];
    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    room = await Room.findByIdAndUpdate(
      req.params.id, 
      updateData,
      { 
        new: true, 
        runValidators: true 
      }
    ).populate({
      path: 'hotelId',
      select: 'name address'
    });

    res.status(200).json({ 
      success: true, 
      message: 'Cập nhật phòng thành công',
      data: room 
    });
  } catch (error) {
    console.error('Chi tiết lỗi:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server',
      error: error.message 
    });
  }
};

// @desc    Xóa phòng
// @route   DELETE /api/rooms/:id
// @access  Private/Hotel Owner, Admin
exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy phòng' 
      });
    }

    const hotel = await Hotel.findById(room.hotelId);

    if (!hotel) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy thông tin khách sạn' 
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Bạn không có quyền xóa phòng này' 
      });
    }

    // Kiểm tra xem phòng có đang được đặt không
    const hasActiveBookings = await Booking.exists({
      roomId: room._id,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (hasActiveBookings) {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa phòng đang có đơn đặt phòng'
      });
    }

    await room.deleteOne();

    res.status(200).json({ 
      success: true, 
      message: 'Xóa phòng thành công' 
    });
  } catch (error) {
    console.error('Chi tiết lỗi:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server',
      error: error.message 
    });
  }
};
