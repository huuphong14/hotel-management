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
      status,
      usageLimit,
      minOrderValue,
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
    if (!code || !discount || !expiryDate || !discountType) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu các trường bắt buộc (code, discount, expiryDate, discountType)'
      });
    }

    // Kiểm tra ngày
    const today = new Date();
    if (new Date(expiryDate) < today) {
      return res.status(400).json({
        success: false,
        message: 'Ngày hết hạn không thể là ngày trong quá khứ'
      });
    }

    // Kiểm tra ngày bắt đầu và ngày kết thúc
    if (startDate && new Date(startDate) > new Date(expiryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu không thể sau ngày hết hạn'
      });
    }

    // Kiểm tra giá trị discount
    if (discountType === 'percentage' && discount > 100) {
      return res.status(400).json({
        success: false,
        message: 'Giảm giá theo phần trăm không thể vượt quá 100%'
      });
    }

    // Chuẩn bị đối tượng voucher
    const voucherData = {
      code: code.toUpperCase().trim(),
      discount,
      startDate: startDate || today,
      expiryDate,
      usageLimit,
      usageCount: 0,
      minOrderValue: minOrderValue || 0,
      discountType,
      status: status || 'active'
    };

    // Chỉ thêm maxDiscount nếu discountType là percentage
    if (discountType === 'percentage' && maxDiscount !== undefined) {
      voucherData.maxDiscount = maxDiscount;
    } else {
      voucherData.maxDiscount = null;
    }



    const voucher = await Voucher.create(voucherData);

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
    const newStartDate = startDate ? new Date(startDate) : voucher.startDate;
    const newExpiryDate = expiryDate ? new Date(expiryDate) : voucher.expiryDate;

    if (newStartDate > newExpiryDate) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu không thể sau ngày hết hạn'
      });
    }

    // Kiểm tra giá trị discount
    const newDiscountType = discountType || voucher.discountType;
    const newDiscount = discount !== undefined ? discount : voucher.discount;
    
    if (newDiscountType === 'percentage' && newDiscount > 100) {
      return res.status(400).json({
        success: false,
        message: 'Giảm giá theo phần trăm không thể vượt quá 100%'
      });
    }

    // Cập nhật thông tin
    if (discount !== undefined) voucher.discount = discount;
    if (startDate) voucher.startDate = startDate;
    if (expiryDate) voucher.expiryDate = expiryDate;
    if (status) voucher.status = status;
    if (usageLimit !== undefined) voucher.usageLimit = usageLimit;
    if (minOrderValue !== undefined) voucher.minOrderValue = minOrderValue;
    if (discountType) voucher.discountType = discountType;
    
    // Xử lý maxDiscount dựa trên discountType
    if (discountType === 'percentage' || voucher.discountType === 'percentage') {
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
    const { roomId, serviceId, totalAmount } = req.query;
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
      .select('code discount discountType maxDiscount minOrderValue startDate expiryDate usageLimit usageCount')
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
