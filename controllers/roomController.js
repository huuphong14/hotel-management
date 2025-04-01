const Room = require('../models/Room');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const cloudinaryService = require('../config/cloudinaryService');

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

    // Kiểm tra và xử lý tiện ích
    const amenities = req.body.amenities ? JSON.parse(req.body.amenities) : [];
    const isValidAmenities = amenities.every(amenity => hotel.amenities.includes(amenity));
    if (!isValidAmenities) {
      return res.status(400).json({ message: "Tiện ích phòng không hợp lệ" });
    }

    // Xử lý upload hình ảnh lên Cloudinary nếu có
    let images = [];
    if (req.files && req.files.length > 0) {
      images = await cloudinaryService.uploadManyFromBuffer(req.files, 'rooms');
    }

    // Gán dữ liệu vào body
    req.body.hotelId = req.params.hotelId;
    req.body.amenities = amenities;
    req.body.images = images;

    // Tạo phòng mới
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

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật phòng này'
      });
    }

    // Xử lý dữ liệu cập nhật
    const allowedFields = ['roomType', 'bedType', 'price', 'capacity', 'squareMeters', 'amenities', 'cancellationPolicy', 'status'];
    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    // Xử lý amenities nếu có
    if (req.body.amenities) {
      const amenities = JSON.parse(req.body.amenities);
      const isValidAmenities = amenities.every(amenity => hotel.amenities.includes(amenity));
      if (!isValidAmenities) {
        return res.status(400).json({ message: "Tiện ích phòng không hợp lệ" });
      }
      updateData.amenities = amenities;
    }

    // Xử lý hình ảnh
    if (req.files && req.files.length > 0) {
      // Upload ảnh mới
      const newImages = await cloudinaryService.uploadManyFromBuffer(req.files, 'rooms');

      // Xóa ảnh cũ trên Cloudinary nếu có
      if (room.images && room.images.length > 0) {
        const publicIds = room.images.map(img => img.publicId);
        await cloudinaryService.deleteMany(publicIds);
      }

      // Gán ảnh mới vào updateData
      updateData.images = newImages;
    }

    // Cập nhật phòng
    room = await Room.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
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

// @desc    Tìm kiếm phòng khách sạn theo địa điểm, ngày và số người
// @route   GET /api/rooms/search
// @access  Public
exports.searchRooms = async (req, res) => {
  try {
    const {
      locationName,      // Tên địa điểm (ví dụ: "Hà Nội", "TP.HCM")
      checkIn,          // Ngày nhận phòng (ISO format: "2025-04-01")
      checkOut,         // Ngày trả phòng (ISO format: "2025-04-05")
      capacity,         // Số người
      hotelName,        // Tên khách sạn (tùy chọn)
      minPrice,         // Giá tối thiểu (tùy chọn)
      maxPrice,         // Giá tối đa (tùy chọn)
      sort = 'price',   // Sắp xếp (price, rating, createdAt)
      page = 1,         // Trang
      limit = 10        // Số lượng kết quả mỗi trang
    } = req.query;

    // Validate dữ liệu đầu vào
    if (!locationName || !checkIn || !checkOut || !capacity) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp địa điểm, ngày nhận phòng, ngày trả phòng và số người'
      });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (checkInDate >= checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'Ngày nhận phòng phải trước ngày trả phòng'
      });
    }

    // 1. Tìm khách sạn theo tên địa điểm
    const hotelQuery = {
      locationName: { $regex: locationName, $options: 'i' } // Tìm kiếm không phân biệt hoa thường
    };
    if (hotelName) {
      hotelQuery.name = { $regex: hotelName, $options: 'i' };
    }

    const hotels = await Hotel.find(hotelQuery).select('_id');
    const hotelIds = hotels.map(hotel => hotel._id);

    if (hotelIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn tại địa điểm này'
      });
    }

    // 2. Tìm phòng còn trống
    // Lấy danh sách phòng đã được đặt trong khoảng thời gian yêu cầu
    const bookedRooms = await Booking.find({
      $or: [
        { checkIn: { $lte: checkOutDate }, checkOut: { $gte: checkInDate } }
      ],
      status: { $in: ['pending', 'confirmed'] }
    }).select('roomId');

    const bookedRoomIds = bookedRooms.map(booking => booking.roomId);

    // Xây dựng query cho phòng
    const roomQuery = {
      hotelId: { $in: hotelIds },
      capacity: { $gte: Number(capacity) }, // Sức chứa lớn hơn hoặc bằng số người
      _id: { $nin: bookedRoomIds },         // Loại bỏ các phòng đã được đặt
      status: 'available'                   // Chỉ lấy phòng đang sẵn sàng
    };

    // Lọc theo giá (tùy chọn)
    if (minPrice || maxPrice) {
      roomQuery.price = {};
      if (minPrice) roomQuery.price.$gte = Number(minPrice);
      if (maxPrice) roomQuery.price.$lte = Number(maxPrice);
    }

    // Tính toán phân trang
    const skip = (Number(page) - 1) * Number(limit);

    // Thực hiện query
    const rooms = await Room.find(roomQuery)
      .populate({
        path: 'hotelId',
        select: 'name address rating images'
      })
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    // Đếm tổng số kết quả
    const total = await Room.countDocuments(roomQuery);

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
