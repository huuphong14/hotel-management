const Voucher = require('../models/Voucher');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');

// @desc    Tạo voucher mới - cập nhật với startDate
// @route   POST /api/vouchers
// @access  Admin
exports.createVoucher = async (req, res) => {
  try {
    const {
      code,
      discount,
      startDate,
      expiryDate,
      usageLimit,
      minOrderValue,
      type,
      discountType,
      maxDiscount
    } = req.body;

    // Kiểm tra mã voucher đã tồn tại
    const existingVoucher = await Voucher.findOne({ code });
    if (existingVoucher) {
      return res.status(400).json({
        success: false,
        message: 'Mã voucher đã tồn tại'
      });
    }

    // Kiểm tra các trường bắt buộc
    if (!type || !discountType) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu các trường bắt buộc (type, discountType)'
      });
    }

    // Kiểm tra ngày
    const today = new Date();
    if (expiryDate && new Date(expiryDate) < today) {
      return res.status(400).json({
        success: false,
        message: 'Ngày hết hạn không thể là ngày trong quá khứ'
      });
    }

    // Kiểm tra ngày bắt đầu và ngày kết thúc
    if (startDate && expiryDate && new Date(startDate) > new Date(expiryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu không thể sau ngày hết hạn'
      });
    }

    const voucher = await Voucher.create({
      code: code.toUpperCase(),
      discount,
      startDate: startDate || today,
      expiryDate,
      usageLimit,
      minOrderValue,
      type,
      discountType,
      maxDiscount: discountType === 'percentage' ? maxDiscount : null
    });

    // Lấy danh sách user để gửi thông báo
    const users = await User.find({ role: 'user' });
    const userIds = users.map(user => user._id);

    // Tạo thông báo
    await NotificationService.createVoucherNotification(voucher, userIds);

    res.status(201).json({
      success: true,
      data: voucher
    });
  } catch (error) {
    console.error('Error creating voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// @desc    Lấy danh sách voucher
// @route   GET /api/vouchers
exports.getVouchers = async (req, res) => {
  try {
    const vouchers = await Voucher.find()
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: vouchers.length,
      data: vouchers
    });
  } catch (error) {
    console.error('Error getting vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};


// @desc    Cập nhật voucher
// @route   PUT /api/vouchers/:id
// @access  Admin
exports.updateVoucher = async (req, res) => {
  try {
    const {
      discount,
      startDate,
      expiryDate,
      status,
      usageLimit,
      minOrderValue,
      type,
      discountType,
      maxDiscount
    } = req.body;

    const voucher = await Voucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy voucher'
      });
    }

    // Kiểm tra ngày bắt đầu và ngày kết thúc
    if (startDate && expiryDate && new Date(startDate) > new Date(expiryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu không thể sau ngày hết hạn'
      });
    }

    if (startDate && !expiryDate && new Date(startDate) > new Date(voucher.expiryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu không thể sau ngày hết hạn'
      });
    }

    if (!startDate && expiryDate && new Date(voucher.startDate) > new Date(expiryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu không thể sau ngày hết hạn'
      });
    }

    // Cập nhật thông tin
    if (discount !== undefined) voucher.discount = discount;
    if (startDate) voucher.startDate = startDate;
    if (expiryDate) voucher.expiryDate = expiryDate;
    if (status) voucher.status = status;
    if (usageLimit !== undefined) voucher.usageLimit = usageLimit;
    if (minOrderValue !== undefined) voucher.minOrderValue = minOrderValue;
    if (type) voucher.type = type;
    if (discountType) voucher.discountType = discountType;
    
    // Chỉ cập nhật maxDiscount nếu discountType là percentage
    if (voucher.discountType === 'percentage') {
      voucher.maxDiscount = maxDiscount;
    } else {
      voucher.maxDiscount = null;
    }

    await voucher.save();

    res.status(200).json({
      success: true,
      data: voucher
    });
  } catch (error) {
    console.error('Error updating voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// @desc    Lấy danh sách voucher có thể sử dụng 
// @route   GET /api/vouchers/available
// @access  Private
exports.getAvailableVouchers = async (req, res) => {
  try {
    const { roomId, serviceId, totalAmount, type } = req.query;
    const now = new Date();

    let query = {
      status: 'active',
      startDate: { $lte: now }, // Đã đến ngày bắt đầu
      expiryDate: { $gt: now }  // Chưa hết hạn
    };

    // Nếu có giá trị đơn hàng
    if (totalAmount) {
      query.minOrderValue = { $lte: parseFloat(totalAmount) };
    }

    const vouchers = await Voucher.find(query)
      .select('code discount discountType maxDiscount minOrderValue startDate expiryDate usageLimit usageCount type')
      .sort({ createdAt: -1 });

    const availableVouchers = vouchers.map(voucher => {
      const voucherObj = voucher.toObject();
      return {
        ...voucherObj,
        remainingUses: voucher.usageLimit ? voucher.usageLimit - voucher.usageCount : null,
        potentialDiscount: totalAmount ? voucher.calculateDiscount(parseFloat(totalAmount)) : null
      };
    });

    res.status(200).json({
      success: true,
      count: availableVouchers.length,
      data: availableVouchers
    });
  } catch (error) {
    console.error('Error getting available vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};
