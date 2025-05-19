const Hotel = require('../models/Hotel');
const cloudinaryService = require('../config/cloudinaryService');
const Room = require('../models/Room');
const Location = require('../models/Location');
const RoomService = require('../services/roomService');
const mongoose = require('mongoose');
// @desc    Tạo khách sạn mới
// @route   POST /api/hotels
// @access  Private/Hotel Owner
exports.createHotel = async (req, res) => {
  try {
    req.body.ownerId = req.user.id;
    
    // Upload ảnh đại diện lên cloud nếu có
    if (req.files && req.files.featuredImage && req.files.featuredImage.length > 0) {
      const featuredImage = req.files.featuredImage[0];
      req.body.featuredImage = await cloudinaryService.uploadFromBuffer(featuredImage);
    }
    
    // Upload mảng ảnh lên cloud nếu có
    if (req.files && req.files.images && req.files.images.length > 0) {
      req.body.images = await cloudinaryService.uploadManyFromBuffer(req.files.images);
    }

    const hotel = await Hotel.create(req.body);

    res.status(201).json({
      success: true,
      data: hotel
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách khách sạn của người dùng đăng nhập
// @route   GET /api/hotels/my-hotels
// @access  Private (Partner)
exports.getMyHotels = async (req, res) => {
  try {
    // Lấy ID của người dùng đang đăng nhập
    const userId = req.user.id;
    
    // Kiểm tra nếu người dùng có vai trò partner
    if (req.user.role !== 'partner') {
      return res.status(403).json({
        success: false,
        message: 'Chỉ đối tác mới có thể xem danh sách khách sạn của mình'
      });
    }
    
    console.log(`Đang tìm kiếm khách sạn của đối tác ${userId}`);
    
    // Tìm tất cả khách sạn mà người dùng sở hữu
    const hotels = await Hotel.find({ ownerId: userId })
      
    console.log(`Đã tìm thấy ${hotels.length} khách sạn của đối tác`);
    
    // Trả về kết quả
    res.status(200).json({
      success: true,
      count: hotels.length,
      data: hotels
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách khách sạn của đối tác:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách khách sạn
// @route   GET /api/hotels
// @access  Public
exports.getHotels = async (req, res) => {
  try {
    const {
      name,
      locationId,
      minPrice,
      maxPrice,
      minDiscountPercent, // Thêm tham số mới
      sort = '-createdAt',
      page = 1,
      limit = 10
    } = req.query;

    // Xây dựng query
    const query = {};

    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }

    if (locationId) {
      query.locationId = locationId;
    }

    // Lọc theo giá (sử dụng giá sau giảm)
    if (minPrice || maxPrice) {
      query.lowestDiscountedPrice = {};
      if (minPrice) query.lowestDiscountedPrice.$gte = Number(minPrice);
      if (maxPrice) query.lowestDiscountedPrice.$lte = Number(maxPrice);
    }

    // Lọc theo phần trăm giảm giá
    if (minDiscountPercent) {
      query.highestDiscountPercent = { $gte: Number(minDiscountPercent) };
    }

    // Áp dụng trạng thái
    query.status = 'active';

    // Xây dựng tùy chọn sắp xếp
    let sortOption = sort;
    if (sort === 'price') {
      sortOption = 'lowestDiscountedPrice';
    } else if (sort === '-price') {
      sortOption = '-lowestDiscountedPrice';
    } else if (sort === 'discount') {
      sortOption = 'highestDiscountPercent';
    } else if (sort === '-discount') {
      sortOption = '-highestDiscountPercent';
    }

    // Tính toán pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Thực hiện query
    const hotels = await Hotel.find(query)
      .populate('ownerId', 'name email')
      .populate('locationId', 'name')
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    // Đếm tổng số khách sạn thỏa mãn điều kiện
    const total = await Hotel.countDocuments(query);

    // Thêm thông tin giảm giá chi tiết vào kết quả
    const hotelsWithDiscountDetails = hotels.map(hotel => {
      const hotelObj = hotel.toObject();
      
      // Thêm thông tin về giảm giá
      if (hotel.highestDiscountPercent > 0) {
        hotelObj.hasDiscount = true;
        hotelObj.originalPrice = hotel.lowestPrice;
        hotelObj.discountedPrice = hotel.lowestDiscountedPrice;
        hotelObj.discountPercent = hotel.highestDiscountPercent;
        hotelObj.savingAmount = hotel.lowestPrice - hotel.lowestDiscountedPrice;
      } else {
        hotelObj.hasDiscount = false;
        hotelObj.originalPrice = hotel.lowestPrice;
        hotelObj.discountedPrice = hotel.lowestPrice;
      }
      
      return hotelObj;
    });

    res.status(200).json({
      success: true,
      count: hotels.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit))
      },
      data: hotelsWithDiscountDetails
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy thông tin một khách sạn
// @route   GET /api/hotels/:id
// @access  Public
exports.getHotel = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id)
      .populate('ownerId', 'name email')
      .populate('locationId', 'name');

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    res.status(200).json({
      success: true,
      data: hotel
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Cập nhật thông tin khách sạn
// @route   PUT /api/hotels/:id
// @access  Private/Hotel Owner, Admin
exports.updateHotel = async (req, res) => {
  try {
    let hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật khách sạn này'
      });
    }

    // Upload ảnh đại diện lên cloud nếu có
    if (req.files && req.files.featuredImage && req.files.featuredImage.length > 0) {
      // Xóa ảnh cũ nếu có
      if (hotel.featuredImage && hotel.featuredImage.publicId) {
        await cloudinaryService.deleteFile(hotel.featuredImage.publicId);
      }
      
      const featuredImage = req.files.featuredImage[0];
      req.body.featuredImage = await cloudinaryService.uploadFromBuffer(featuredImage);
    }
    
    // Xử lý mảng ảnh nếu có
    if (req.files && req.files.images && req.files.images.length > 0) {
      // Nếu muốn thay thế toàn bộ ảnh cũ
      if (req.body.replaceAllImages === 'true') {
        // Xóa tất cả ảnh cũ trên cloud
        if (hotel.images && hotel.images.length > 0) {
          const publicIds = hotel.images
            .filter(img => img.publicId)
            .map(img => img.publicId);
          await cloudinaryService.deleteMany(publicIds);
        }
        
        // Upload tất cả ảnh mới
        req.body.images = await cloudinaryService.uploadManyFromBuffer(req.files.images);
      } else {
        // Nếu muốn thêm ảnh mới vào mảng ảnh hiện tại
        const newImages = await cloudinaryService.uploadManyFromBuffer(req.files.images);
        
        // Lấy mảng ảnh hiện tại
        const currentImages = hotel.images || [];
        
        // Gộp mảng ảnh mới và cũ
        req.body.images = [...currentImages, ...newImages];
      }
    }

    hotel = await Hotel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: hotel
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách khách sạn theo địa điểm
// @route   GET /api/hotels/location/:locationId
// @access  Public
exports.getHotelsByLocation = async (req, res) => {
  try {
    const hotels = await Hotel.find({ 
      locationId: req.params.locationId,
      status: 'active'
    })
    .populate('locationId', 'name')
    .populate('ownerId', 'name');
    
    res.status(200).json({
      success: true,
      count: hotels.length,
      data: hotels
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Xóa khách sạn
// @route   DELETE /api/hotels/:id
// @access  Private/Hotel Owner
exports.deleteHotel = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa khách sạn này'
      });
    }

    // Xóa ảnh đại diện trên cloud nếu có
    if (hotel.featuredImage && hotel.featuredImage.publicId) {
      await cloudinaryService.deleteFile(hotel.featuredImage.publicId);
    }

    // Xóa tất cả ảnh trong mảng images
    if (hotel.images && hotel.images.length > 0) {
      const publicIds = hotel.images
        .filter(img => img.publicId)
        .map(img => img.publicId);
      await cloudinaryService.deleteMany(publicIds);
    }

    await hotel.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Khách sạn đã được xóa'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Upload hình ảnh cho khách sạn
// @route   POST /api/hotels/:id/images
// @access  Private/Hotel Owner
exports.uploadHotelImages = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật khách sạn này'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng upload ít nhất một hình ảnh'
      });
    }

    // Upload các ảnh mới lên cloud
    const newImages = await cloudinaryService.uploadManyFromBuffer(req.files);

    // Thêm ảnh mới vào mảng ảnh hiện tại
    const currentImages = hotel.images || [];
    hotel.images = [...currentImages, ...newImages];

    await hotel.save();

    res.status(200).json({
      success: true,
      count: hotel.images.length,
      data: hotel.images
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Xóa một ảnh từ mảng images của khách sạn
// @route   DELETE /api/hotels/:id/images/:imageIndex
// @access  Private/Hotel Owner
exports.deleteHotelImage = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật khách sạn này'
      });
    }

    const imageIndex = parseInt(req.params.imageIndex);
    
    if (!hotel.images || imageIndex >= hotel.images.length || imageIndex < 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hình ảnh'
      });
    }

    // Lấy ảnh cần xóa
    const imageToDelete = hotel.images[imageIndex];
    
    // Xóa ảnh trên Cloudinary
    if (imageToDelete.publicId) {
      await cloudinaryService.deleteFile(imageToDelete.publicId);
    }
    
    // Xóa ảnh khỏi mảng
    hotel.images.splice(imageIndex, 1);
    await hotel.save();
    
    res.status(200).json({
      success: true,
      message: 'Đã xóa hình ảnh thành công',
      data: hotel.images
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Cập nhật ảnh đại diện
// @route   PUT /api/hotels/:id/featured-image
// @access  Private/Hotel Owner
exports.updateFeaturedImage = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật khách sạn này'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng upload hình ảnh'
      });
    }

    // Xóa ảnh đại diện cũ trên cloud nếu có
    if (hotel.featuredImage && hotel.featuredImage.publicId) {
      await cloudinaryService.deleteFile(hotel.featuredImage.publicId);
    }

    // Upload ảnh mới lên cloud
    hotel.featuredImage = await cloudinaryService.uploadFromBuffer(req.file);
    await hotel.save();

    res.status(200).json({
      success: true,
      data: hotel.featuredImage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách khách sạn đang có giảm giá
// @route   GET /api/hotels/discounts
// @access  Public
exports.getDiscountedHotels = async (req, res) => {
  try {
    const {
      sort = '-highestDiscountPercent',
      page = 1,
      limit = 10
    } = req.query;

    // Tìm khách sạn có giảm giá
    const query = {
      highestDiscountPercent: { $gt: 0 },
      status: 'active'
    };

    // Tính toán phân trang
    const skip = (Number(page) - 1) * Number(limit);

    // Lấy thông tin khách sạn có giảm giá
    const hotels = await Hotel.find(query)
      .populate('ownerId', 'name email')
      .populate('locationId', 'name')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    // Đếm tổng số khách sạn có giảm giá
    const total = await Hotel.countDocuments(query);

    // Định dạng lại kết quả với thông tin chi tiết về giảm giá
    const hotelsWithDiscountInfo = hotels.map(hotel => {
      const hotelObj = hotel.toObject();
      
      hotelObj.hasDiscount = true;
      hotelObj.originalPrice = hotel.lowestPrice;
      hotelObj.discountedPrice = hotel.lowestDiscountedPrice; 
      hotelObj.discountPercent = hotel.highestDiscountPercent;
      hotelObj.savingAmount = hotel.lowestPrice - hotel.lowestDiscountedPrice;
      
      return hotelObj;
    });

    res.status(200).json({
      success: true,
      count: hotelsWithDiscountInfo.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit))
      },
      data: hotelsWithDiscountInfo
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

// @desc    Tìm kiếm khách sạn có phòng trống theo địa điểm, ngày và số người
// @route   GET /api/hotels/search
// @access  Public
exports.searchHotelsWithAvailableRooms = async (req, res) => {
  try {
    const {
      locationName,
      checkIn,
      checkOut,
      capacity,
      hotelName,
      minPrice,
      maxPrice,
      roomType,
      amenities,
      sort = 'price',
      page = 1,
      limit = 10
    } = req.query;

    // Validate input
    if (!locationName || !checkIn || !checkOut || !capacity) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp địa điểm, ngày nhận phòng, ngày trả phòng và số người'
      });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate) || isNaN(checkOutDate)) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng ngày không hợp lệ'
      });
    }
    if (checkInDate >= checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'Ngày nhận phòng phải trước ngày trả phòng'
      });
    }

    // Find location
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

    // Find hotels
    const hotelQuery = { locationId: location._id, status: 'active' };
    if (hotelName) {
      hotelQuery.name = { $regex: hotelName, $options: 'i' };
    }
    const hotels = await Hotel.find(hotelQuery).select('_id');
    const hotelIds = hotels.map(h => h._id);
    if (hotelIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn tại địa điểm này'
      });
    }

    // Build room query
    const roomQuery = {
      hotelId: { $in: hotelIds },
      capacity: { $gte: Number(capacity) }
    };
    if (roomType) {
      roomQuery.roomType = roomType;
    }
if (amenities) {
      const amenitiesArray = Array.isArray(amenities) ? amenities : amenities.split(',');
      const objectIds = amenitiesArray.map(id => new mongoose.Types.ObjectId(id));
      roomQuery.amenities = { $all: objectIds };
    }

    // Sort options
    const sortOptions = {};
    if (sort === 'price') sortOptions.discountedPrice = 1;
    else if (sort === '-price') sortOptions.discountedPrice = -1;
    else if (sort === 'rating') sortOptions['hotelId.rating'] = 1;
    else if (sort === '-rating') sortOptions['hotelId.rating'] = -1;
    else if (sort === 'discountPercent') sortOptions.discountPercent = 1;
    else if (sort === '-discountPercent') sortOptions.discountPercent = -1;

    // Fetch available rooms
    const rooms = await RoomService.findAvailableRooms(
      roomQuery,
      checkInDate,
      checkOutDate,
      {
        sort: sortOptions,
        skip: (Number(page) - 1) * Number(limit),
        limit: Number(limit),
        minPrice,
        maxPrice
      }
    );

    // Group by hotel
    const hotelMap = new Map();
    rooms.forEach(room => {
      const hotelId = room.hotelId._id.toString();
      if (!hotelMap.has(hotelId)) {
        hotelMap.set(hotelId, {
          _id: room.hotelId._id,
          name: room.hotelId.name,
          address: room.hotelId.address,
          rating: room.hotelId.rating,
          images: room.hotelId.images,
          featuredImage: room.hotelId.featuredImage,
          policies: room.hotelId.policies,
          amenities: room.hotelId.amenities,
          lowestPrice: room.hotelId.lowestPrice,
          lowestDiscountedPrice: room.hotelId.lowestDiscountedPrice,
          highestDiscountPercent: room.hotelId.highestDiscountPercent,
          availableRoomCount: 0
        });
      }
      hotelMap.get(hotelId).availableRoomCount += 1;
    });

    const hotelsWithAvailableRooms = Array.from(hotelMap.values());
    const total = hotelsWithAvailableRooms.length;

    res.status(200).json({
      success: true,
      count: hotelsWithAvailableRooms.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit))
      },
      data: hotelsWithAvailableRooms
    });
  } catch (error) {
    console.error('Search hotels error:', { message: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// @desc    Lấy danh sách phòng còn trống trong một khách sạn
// @route   GET /api/hotels/:hotelId/rooms/available
// @access  Public
exports.getAvailableRoomsByHotel = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const {
      checkIn,
      checkOut,
      capacity,
      minPrice,
      maxPrice,
      roomType,
      amenities,
      sort = 'price',
      page = 1,
      limit = 10
    } = req.query;

    console.log('getAvailableRoomsByHotel - Query params:', req.query, 'Hotel ID:', hotelId);

    // Validate input
    if (!checkIn || !checkOut || !capacity) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ngày nhận phòng, ngày trả phòng và số người'
      });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate) || isNaN(checkOutDate)) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng ngày không hợp lệ'
      });
    }
    if (checkInDate >= checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'Ngày nhận phòng phải trước ngày trả phòng'
      });
    }

    // Validate sort
    const validSortValues = ['price', '-price', 'discountPercent', '-discountPercent'];
    if (sort && !validSortValues.includes(sort)) {
      return res.status(400).json({
        success: false,
        message: `Giá trị sort không hợp lệ. Chấp nhận: ${validSortValues.join(', ')}`
      });
    }

    // Validate hotel
    const hotel = await Hotel.findById(hotelId);
    if (!hotel || hotel.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn hoặc khách sạn không hoạt động'
      });
    }

    // Build room query
    const roomQuery = {
      hotelId: new mongoose.Types.ObjectId(hotelId),
      capacity: { $gte: Number(capacity) }
    };
    if (roomType) {
      roomQuery.roomType = roomType;
    }
    if (amenities) {
      const amenitiesArray = Array.isArray(amenities) ? amenities : amenities.split(',');
      roomQuery.amenities = { $all: amenitiesArray };
    }

    // Sort options
    const sortOptions = {};
    if (sort === 'price') sortOptions.discountedPrice = 1;
    else if (sort === '-price') sortOptions.discountedPrice = -1;
    else if (sort === 'discountPercent') sortOptions.discountPercent = 1;
    else if (sort === '-discountPercent') sortOptions.discountPercent = -1;

    // Fetch available rooms
    const rooms = await RoomService.findAvailableRooms(
      roomQuery,
      checkInDate,
      checkOutDate,
      {
        sort: sortOptions,
        skip: (Number(page) - 1) * Number(limit),
        limit: Number(limit),
        minPrice,
        maxPrice
      }
    );

    // Count total rooms
    const total = (await RoomService.findAvailableRooms(roomQuery, checkInDate, checkOutDate, { minPrice, maxPrice })).length;

    console.log('Available rooms for hotel', hotelId, ':', rooms.map(room => room._id.toString()));

    res.status(200).json({
      success: true,
      count: rooms.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit))
      },
      data: rooms.map(room => ({
        _id: room._id,
        name: room.name,
        description: room.description,
        floor: room.floor,
        roomType: room.roomType,
        bedType: room.bedType,
        price: room.price,
        discountedPrice: room.discountedPrice,
        discountPercent: room.discountPercent,
        discountStartDate: room.discountStartDate,
        discountEndDate: room.discountEndDate,
        capacity: room.capacity,
        squareMeters: room.squareMeters,
        amenities: room.amenities, // Contains full objects: {_id, name, type, icon}
        images: room.images,
        cancellationPolicy: room.cancellationPolicy,
        status: room.status,
        hasDiscount: room.hasDiscount,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt
      }))
    });
  } catch (error) {
    console.error('Get available rooms error:', { message: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};