const Room = require('../models/Room');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const Location = require('../models/Location');
const cloudinaryService = require('../config/cloudinaryService');
const { updateHotelLowestPrice } = require('../utils/hotelHelpers');


// @desc    Tạo phòng mới cho khách sạn
// @route   POST /api/hotels/:hotelId/rooms
// @access  Private/Hotel Owner
exports.createRoom = async (req, res) => {
  try {
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    const hotel = await Hotel.findById(req.params.hotelId);

    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách sạn' });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thêm phòng' });
    }

    // Kiểm tra và xử lý tiện ích phòng
    const amenities = req.body.amenities ? JSON.parse(req.body.amenities) : [];
    
    // Kiểm tra xem tất cả các tiện ích đều tồn tại và thuộc loại "room"
    if (amenities.length > 0) {
      const validAmenities = await Amenity.find({
        _id: { $in: amenities },
        type: "room"
      });
      
      if (validAmenities.length !== amenities.length) {
        return res.status(400).json({ 
          success: false,
          message: "Một số tiện ích phòng không hợp lệ hoặc không tồn tại" 
        });
      }
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
    await updateHotelLowestPrice(req.params.hotelId);

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

// @desc    Lấy thông tin chi tiết một phòng
// @route   GET /api/rooms/:id
// @access  Public
exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate({
        path: 'hotelId',
        select: 'name address rating images contact'
      })
      .populate({
        path: 'amenities',
        select: 'name icon description type'
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
      .populate({
        path: 'amenities',
        select: 'name icon description type'
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
      
      // Kiểm tra xem tất cả các tiện ích đều tồn tại và thuộc loại "room"
      const validAmenities = await Amenity.find({
        _id: { $in: amenities },
        type: "room"
      });
      
      if (validAmenities.length !== amenities.length) {
        return res.status(400).json({ 
          success: false,
          message: "Một số tiện ích phòng không hợp lệ hoặc không tồn tại" 
        });
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

    await updateHotelLowestPrice(req.params.hotelId);

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

    await updateHotelLowestPrice(req.params.hotelId);

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

// Cập nhật hàm searchRooms để bao gồm thông tin giảm giá
// @desc    Tìm kiếm phòng khách sạn theo địa điểm, ngày và số người
// @route   GET /api/rooms/search
// @access  Public
exports.searchRooms = async (req, res) => {
  try {
    const {
      locationName,
      checkIn,
      checkOut,
      capacity,
      hotelName,
      minPrice,
      maxPrice,
      sort = 'price',
      page = 1,
      limit = 10
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

    // Bước 1: Tìm Location ID từ tên địa điểm
    const location = await Location.findOne({ 
      name: { $regex: locationName, $options: 'i' },
      status: 'active'
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm du lịch này'
      });
    }

    // Bước 2: Tìm khách sạn theo locationId
    const hotelQuery = {
      locationId: location._id,
      status: 'active'
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

    // Lấy danh sách phòng đã được đặt
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
      capacity: { $gte: Number(capacity) },
      _id: { $nin: bookedRoomIds },
      status: 'available'
    };

    // Ngày hiện tại để tính giảm giá
    const currentDate = new Date();

    // Tính toán phân trang
    const skip = (Number(page) - 1) * Number(limit);

    // Thực hiện query
    let rooms = await Room.find(roomQuery)
      .populate({
        path: 'hotelId',
        select: 'name address rating images'
      });

    // Tính toán giá sau giảm giá
    rooms = rooms.map(room => {
      const roomObj = room.toObject();
      
      // Kiểm tra nếu có giảm giá đang áp dụng
      if (
        room.discountPercent > 0 &&
        room.discountStartDate && room.discountEndDate &&
        currentDate >= room.discountStartDate &&
        currentDate <= room.discountEndDate
      ) {
        roomObj.originalPrice = room.price;
        roomObj.discountPercent = room.discountPercent;
        roomObj.discountedPrice = room.price * (1 - room.discountPercent / 100);
        roomObj.discountEndDate = room.discountEndDate;
        roomObj.hasDiscount = true;
      } else {
        roomObj.originalPrice = room.price;
        roomObj.discountedPrice = room.price;
        roomObj.hasDiscount = false;
      }
      
      return roomObj;
    });

    // Lọc theo khoảng giá (nếu có)
    if (minPrice || maxPrice) {
      rooms = rooms.filter(room => {
        const price = room.discountedPrice;
        if (minPrice && price < Number(minPrice)) return false;
        if (maxPrice && price > Number(maxPrice)) return false;
        return true;
      });
    }

    // Sắp xếp
    if (sort === 'price') {
      rooms.sort((a, b) => a.discountedPrice - b.discountedPrice);
    } else if (sort === '-price') {
      rooms.sort((a, b) => b.discountedPrice - a.discountedPrice);
    } else if (sort === 'rating') {
      rooms.sort((a, b) => a.hotelId.rating - b.hotelId.rating);
    } else if (sort === '-rating') {
      rooms.sort((a, b) => b.hotelId.rating - a.hotelId.rating);
    } else if (sort === 'discountPercent') {
      rooms.sort((a, b) => (a.discountPercent || 0) - (b.discountPercent || 0));
    } else if (sort === '-discountPercent') {
      rooms.sort((a, b) => (b.discountPercent || 0) - (a.discountPercent || 0));
    }

    // Áp dụng phân trang sau khi lọc và sắp xếp
    const total = rooms.length;
    rooms = rooms.slice(skip, skip + Number(limit));

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

// @desc    Cài đặt giảm giá cho phòng
// @route   PUT /api/rooms/:id/discount
// @access  Private/Hotel Owner
exports.setRoomDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const { discountPercent, startDate, endDate } = req.body;

    // Validate dữ liệu đầu vào
    if (!discountPercent || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp phần trăm giảm giá, ngày bắt đầu và ngày kết thúc'
      });
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (startDateObj >= endDateObj) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu phải trước ngày kết thúc'
      });
    }

    // Lấy thông tin phòng
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    // Kiểm tra quyền sở hữu
    const hotel = await Hotel.findById(room.hotelId);
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cài đặt giảm giá cho phòng này'
      });
    }

    // Cập nhật thông tin giảm giá
    room.discountPercent = discountPercent;
    room.discountStartDate = startDateObj;
    room.discountEndDate = endDateObj;

    await room.save();
    await updateHotelLowestPrice(room.hotelId);

    res.status(200).json({
      success: true,
      message: 'Cài đặt giảm giá thành công',
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

// @desc    Hủy giảm giá phòng
// @route   DELETE /api/rooms/:id/discount
// @access  Private/Hotel Owner
exports.removeRoomDiscount = async (req, res) => {
  try {
    const { id } = req.params;

    // Lấy thông tin phòng
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    // Kiểm tra quyền sở hữu
    const hotel = await Hotel.findById(room.hotelId);
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền hủy giảm giá cho phòng này'
      });
    }

    // Xóa thông tin giảm giá
    room.discountPercent = 0;
    room.discountStartDate = null;
    room.discountEndDate = null;

    await room.save();
    await updateHotelLowestPrice(room.hotelId);

    res.status(200).json({
      success: true,
      message: 'Hủy giảm giá thành công',
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