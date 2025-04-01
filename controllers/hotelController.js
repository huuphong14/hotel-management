const Hotel = require('../models/Hotel');
const cloudinaryService = require('../config/cloudinaryService');

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

// @desc    Lấy danh sách khách sạn
// @route   GET /api/hotels
// @access  Public
exports.getHotels = async (req, res) => {
  try {
    const hotels = await Hotel.find().populate('ownerId', 'name email');

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

// @desc    Lấy thông tin một khách sạn
// @route   GET /api/hotels/:id
// @access  Public
exports.getHotel = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id).populate('ownerId', 'name email');

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