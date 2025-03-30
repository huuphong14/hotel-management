const Amenity = require('../models/Amenity');

// @desc    Tạo tiện ích mới
// @route   POST /api/amenities
// @access  Private/Admin
exports.createAmenity = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Chỉ admin mới có quyền thực hiện hành động này'
      });
    }

    const amenity = await Amenity.create(req.body);

    res.status(201).json({
      success: true,
      data: amenity
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách tiện ích
// @route   GET /api/amenities
// @access  Public
exports.getAmenities = async (req, res) => {
  try {
    const amenities = await Amenity.find();

    res.status(200).json({
      success: true,
      count: amenities.length,
      data: amenities
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy thông tin một tiện ích
// @route   GET /api/amenities/:id
// @access  Public
exports.getAmenity = async (req, res) => {
  try {
    const amenity = await Amenity.findById(req.params.id);

    if (!amenity) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tiện ích'
      });
    }

    res.status(200).json({
      success: true,
      data: amenity
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Cập nhật tiện ích
// @route   PUT /api/amenities/:id
// @access  Private/Admin
exports.updateAmenity = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Chỉ admin mới có quyền thực hiện hành động này'
      });
    }

    const amenity = await Amenity.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!amenity) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tiện ích'
      });
    }

    res.status(200).json({
      success: true,
      data: amenity
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Xóa tiện ích
// @route   DELETE /api/amenities/:id
// @access  Private/Admin
exports.deleteAmenity = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Chỉ admin mới có quyền thực hiện hành động này'
      });
    }

    const amenity = await Amenity.findById(req.params.id);

    if (!amenity) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tiện ích'
      });
    }

    await amenity.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Tiện ích đã được xóa'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};