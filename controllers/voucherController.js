const Voucher = require('../models/Voucher');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');

// @desc    Tạo voucher mới
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
        errorCode: 'VOUCHER_CODE_EXISTS',
        message: 'Mã voucher đã tồn tại'
      });
    }

    // Kiểm tra các trường bắt buộc
    if (!code || !discount || !expiryDate || !discountType) {
      return res.status(400).json({
        success: false,
        errorCode: 'MISSING_REQUIRED_FIELDS',
        message: 'Thiếu các trường bắt buộc (code, discount, expiryDate, discountType)'
      });
    }

    // Kiểm tra định dạng ngày
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_START_DATE',
        message: 'Ngày bắt đầu không hợp lệ'
      });
    }
    if (isNaN(new Date(expiryDate).getTime())) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_EXPIRY_DATE',
        message: 'Ngày hết hạn không hợp lệ'
      });
    }

    // Chuẩn hóa ngày về UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setUTCHours(0, 0, 0, 0);
    const start = startDate ? new Date(startDate) : today;
    start.setUTCHours(0, 0, 0, 0);

    // Kiểm tra ngày
    if (expiry < today) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_EXPIRY_DATE',
        message: 'Ngày hết hạn không thể là ngày trong quá khứ'
      });
    }

    // Kiểm tra ngày bắt đầu và ngày kết thúc
    if (start > expiry) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_DATE_RANGE',
        message: 'Ngày bắt đầu không thể sau ngày hết hạn'
      });
    }

    // Kiểm tra giá trị discount
    if (discountType === 'percentage' && discount > 100) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_DISCOUNT',
        message: 'Giảm giá theo phần trăm không thể vượt quá 100%'
      });
    }

    // Chuẩn bị đối tượng voucher
    const voucherData = {
      code: code.toUpperCase().trim(),
      discount,
      startDate: start,
      expiryDate: expiry,
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
      errorCode: 'SERVER_ERROR',
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// @desc    Lấy danh sách voucher
// @route   GET /api/vouchers
// @access  Admin
exports.getVouchers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const vouchers = await Voucher.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Voucher.countDocuments();

    res.status(200).json({
      success: true,
      pagination: {
        total,
        currentPage: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      data: vouchers
    });
  } catch (error) {
    console.error('Error getting vouchers:', error);
    res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
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
        errorCode: 'VOUCHER_NOT_FOUND',
        message: 'Không tìm thấy voucher'
      });
    }

    // Kiểm tra định dạng ngày
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_START_DATE',
        message: 'Ngày bắt đầu không hợp lệ'
      });
    }
    if (expiryDate && isNaN(new Date(expiryDate).getTime())) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_EXPIRY_DATE',
        message: 'Ngày hết hạn không hợp lệ'
      });
    }

    // Chuẩn hóa ngày về UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const newStartDate = startDate ? new Date(startDate) : voucher.startDate;
    newStartDate.setUTCHours(0, 0, 0, 0);
    const newExpiryDate = expiryDate ? new Date(expiryDate) : voucher.expiryDate;
    newExpiryDate.setUTCHours(0, 0, 0, 0);

    // Kiểm tra ngày
    if (newExpiryDate < today) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_EXPIRY_DATE',
        message: 'Ngày hết hạn không thể là ngày trong quá khứ'
      });
    }

    if (newStartDate > newExpiryDate) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_DATE_RANGE',
        message: 'Ngày bắt đầu không thể sau ngày hết hạn'
      });
    }

    // Kiểm tra giá trị discount
    const newDiscountType = discountType || voucher.discountType;
    const newDiscount = discount !== undefined ? discount : voucher.discount;

    if (newDiscountType === 'percentage' && newDiscount > 100) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_DISCOUNT',
        message: 'Giảm giá theo phần trăm không thể vượt quá 100%'
      });
    }

    // Cập nhật thông tin
    if (discount !== undefined) voucher.discount = discount;
    if (startDate) voucher.startDate = newStartDate;
    if (expiryDate) voucher.expiryDate = newExpiryDate;
    if (status) voucher.status = status;
    if (usageLimit !== undefined) voucher.usageLimit = usageLimit;
    if (minOrderValue !== undefined) voucher.minOrderValue = minOrderValue;
    if (discountType) voucher.discountType = discountType;

    // Xử lý maxDiscount dựa trên discountType
    if (newDiscountType === 'percentage') {
      voucher.maxDiscount = maxDiscount !== undefined ? maxDiscount : voucher.maxDiscount;
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
      errorCode: 'SERVER_ERROR',
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
    const { totalAmount, page = 1, limit = 10 } = req.query;

    let parsedTotalAmount = null;
    if (totalAmount !== undefined) {
      parsedTotalAmount = parseFloat(totalAmount);
      if (isNaN(parsedTotalAmount) || parsedTotalAmount < 0) {
        return res.status(400).json({
          success: false,
          errorCode: 'INVALID_TOTAL_AMOUNT',
          message: 'Giá trị đơn hàng không hợp lệ'
        });
      }
    }

    const now = new Date();

    // Lấy thời điểm đầu và cuối ngày hiện tại (giờ địa phương hoặc UTC+7)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Query: status active, startDate <= endOfToday, expiryDate >= startOfToday
    const query = {
      status: 'active',
      startDate: { $lte: endOfToday },
      expiryDate: { $gte: startOfToday },
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ['$usageCount', '$usageLimit'] } }
      ]
    };

    if (parsedTotalAmount !== null) {
      query.minOrderValue = { $lte: parsedTotalAmount };
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const vouchers = await Voucher.find(query)
      .select('code discount discountType maxDiscount minOrderValue startDate expiryDate usageLimit usageCount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const availableVouchers = vouchers.map(voucher => ({
      ...voucher.toObject(),
      remainingUses: voucher.usageLimit ? voucher.usageLimit - voucher.usageCount : null
    }));

    res.status(200).json({
      success: true,
      pagination: {
        total: availableVouchers.length,
        currentPage: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(availableVouchers.length / limitNum)
      },
      data: availableVouchers
    });
  } catch (error) {
    console.error('Error getting available vouchers:', error);
    res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Lỗi server',
      error: error.message
    });
  }
};
