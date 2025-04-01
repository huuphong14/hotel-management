const Hotel = require('../models/Hotel');

// @desc    Tạo khách sạn mới
// @route   POST /api/hotels
// @access  Private/Hotel Owner
exports.createHotel = async (req, res) => {
  try {
    req.body.ownerId = req.user.id;
    
    // Xử lý ảnh đại diện nếu có
    if (req.files && req.files.featuredImage && req.files.featuredImage.length > 0) {
      const featuredImage = req.files.featuredImage[0];
      req.body.featuredImage = {
        data: featuredImage.buffer,
        contentType: featuredImage.mimetype,
        filename: featuredImage.originalname
      };
    }
    
    // Xử lý mảng ảnh nếu có
    if (req.files && req.files.images && req.files.images.length > 0) {
      req.body.images = req.files.images.map(file => ({
        data: file.buffer,
        contentType: file.mimetype,
        filename: file.originalname
      }));
    }

    const hotel = await Hotel.create(req.body);

    // Không trả về dữ liệu ảnh trong response để giảm kích thước
    const responseHotel = hotel.toObject();
    if (responseHotel.featuredImage && responseHotel.featuredImage.data) {
      delete responseHotel.featuredImage.data;
    }
    
    if (responseHotel.images) {
      responseHotel.images = responseHotel.images.map(img => {
        if (img.data) {
          const { data, ...imageWithoutData } = img;
          return imageWithoutData;
        }
        return img;
      });
    }

    res.status(201).json({
      success: true,
      data: responseHotel
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

    // Loại bỏ dữ liệu ảnh từ response để giảm kích thước
    const responseHotels = hotels.map(hotel => {
      const hotelObj = hotel.toObject();
      
      // Kiểm tra và xóa dữ liệu ảnh đại diện
      if (hotelObj.featuredImage && hotelObj.featuredImage.data) {
        delete hotelObj.featuredImage.data;
      }
      
      // Kiểm tra và xóa dữ liệu từ mảng ảnh
      if (hotelObj.images) {
        hotelObj.images = hotelObj.images.map(img => {
          if (img.data) {
            const { data, ...imageWithoutData } = img;
            return imageWithoutData;
          }
          return img;
        });
      }
      
      return hotelObj;
    });

    res.status(200).json({
      success: true,
      count: responseHotels.length,
      data: responseHotels
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

    // Loại bỏ dữ liệu ảnh từ response để giảm kích thước
    const responseHotel = hotel.toObject();
    
    if (responseHotel.featuredImage && responseHotel.featuredImage.data) {
      delete responseHotel.featuredImage.data;
    }
    
    if (responseHotel.images) {
      responseHotel.images = responseHotel.images.map(img => {
        if (img.data) {
          const { data, ...imageWithoutData } = img;
          return imageWithoutData;
        }
        return img;
      });
    }

    res.status(200).json({
      success: true,
      data: responseHotel
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

    // Xử lý ảnh đại diện nếu có
    if (req.files && req.files.featuredImage && req.files.featuredImage.length > 0) {
      const featuredImage = req.files.featuredImage[0];
      req.body.featuredImage = {
        data: featuredImage.buffer,
        contentType: featuredImage.mimetype,
        filename: featuredImage.originalname
      };
    }
    
    // Xử lý mảng ảnh nếu có
    if (req.files && req.files.images && req.files.images.length > 0) {
      // Nếu muốn thay thế toàn bộ ảnh cũ
      if (req.body.replaceAllImages === 'true') {
        req.body.images = req.files.images.map(file => ({
          data: file.buffer,
          contentType: file.mimetype,
          filename: file.originalname
        }));
      } else {
        // Nếu muốn thêm ảnh mới vào mảng ảnh hiện tại
        const newImages = req.files.images.map(file => ({
          data: file.buffer,
          contentType: file.mimetype,
          filename: file.originalname
        }));
        
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

    // Loại bỏ dữ liệu ảnh từ response để giảm kích thước
    const responseHotel = hotel.toObject();
    
    if (responseHotel.featuredImage && responseHotel.featuredImage.data) {
      delete responseHotel.featuredImage.data;
    }
    
    if (responseHotel.images) {
      responseHotel.images = responseHotel.images.map(img => {
        if (img.data) {
          const { data, ...imageWithoutData } = img;
          return imageWithoutData;
        }
        return img;
      });
    }

    res.status(200).json({
      success: true,
      data: responseHotel
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

    // Xử lý mảng ảnh
    const newImages = req.files.map(file => ({
      data: file.buffer,
      contentType: file.mimetype,
      filename: file.originalname
    }));

    // Thêm ảnh mới vào mảng ảnh hiện tại
    const currentImages = hotel.images || [];
    hotel.images = [...currentImages, ...newImages];

    await hotel.save();

    // Trả về thông tin không bao gồm dữ liệu ảnh
    const responseImages = hotel.images.map(img => {
      if (img.data) {
        const { data, ...imageWithoutData } = img;
        return imageWithoutData;
      }
      return img;
    });

    res.status(200).json({
      success: true,
      count: hotel.images.length,
      data: responseImages
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy một ảnh từ mảng images của khách sạn
// @route   GET /api/hotels/:id/images/:imageIndex
// @access  Public
exports.getHotelImage = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    const imageIndex = parseInt(req.params.imageIndex);
    
    if (!hotel.images || imageIndex >= hotel.images.length || imageIndex < 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hình ảnh'
      });
    }

    const image = hotel.images[imageIndex];
    
    // Thiết lập header và trả về dữ liệu hình ảnh
    res.set('Content-Type', image.contentType);
    return res.send(image.data);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy ảnh đại diện của khách sạn
// @route   GET /api/hotels/:id/featured-image
// @access  Public
exports.getFeaturedImage = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    if (!hotel.featuredImage || !hotel.featuredImage.data) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ảnh đại diện'
      });
    }

    // Thiết lập header và trả về dữ liệu hình ảnh
    res.set('Content-Type', hotel.featuredImage.contentType);
    return res.send(hotel.featuredImage.data);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};