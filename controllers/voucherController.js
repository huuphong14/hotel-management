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
      expiryDate,
      usageLimit,
      minOrderValue
    } = req.body;

    // Kiểm tra mã voucher đã tồn tại
    const existingVoucher = await Voucher.findOne({ code });
    if (existingVoucher) {
      return res.status(400).json({
        success: false,
        message: 'Mã voucher đã tồn tại'
      });
    }

    const voucher = await Voucher.create({
      code: code.toUpperCase(),
      discount,
      expiryDate,
      usageLimit,
      minOrderValue
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
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
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
      data: vouchers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
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
      expiryDate,
      status,
      usageLimit,
      minOrderValue
    } = req.body;

    const voucher = await Voucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy voucher'
      });
    }

    // Cập nhật thông tin
    if (discount) voucher.discount = discount;
    if (expiryDate) voucher.expiryDate = expiryDate;
    if (status) voucher.status = status;
    if (usageLimit !== undefined) voucher.usageLimit = usageLimit;
    if (minOrderValue) voucher.minOrderValue = minOrderValue;

    await voucher.save();

    res.status(200).json({
      success: true,
      data: voucher
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách voucher có thể sử dụng
// @route   GET /api/vouchers/available
// @access  Private
exports.getAvailableVouchers = async (req, res) => {
  try {
    const { roomId, totalAmount } = req.query;

    let query = {
      status: 'active',
      type: 'room',
      expiryDate: { $gt: new Date() }
    };

    if (totalAmount) {
      query.minOrderValue = { $lte: totalAmount };
    }

    const vouchers = await Voucher.find(query)
      .select('code discount discountType maxDiscount minOrderValue expiryDate usageLimit usageCount')
      .sort({ createdAt: -1 });

    const availableVouchers = vouchers.map(voucher => ({
      ...voucher.toObject(),
      remainingUses: voucher.usageLimit ? voucher.usageLimit - voucher.usageCount : null,
      potentialDiscount: totalAmount ? voucher.calculateDiscount(totalAmount) : null
    }));

    res.status(200).json({
      success: true,
      data: availableVouchers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
}; 