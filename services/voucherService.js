const Voucher = require('../models/Voucher');

async function validateVoucher(voucherId, originalPrice, checkInDate, currentDate = new Date()) {
  try {
    if (!voucherId) {
      return {
        success: true,
        discountAmount: 0,
        voucher: null,
        message: 'No voucher provided',
        errorCode: null
      };
    }

    // Find voucher
    const voucher = await Voucher.findById(voucherId);
    if (!voucher) {
      return {
        success: false,
        errorCode: 'VOUCHER_NOT_FOUND',
        message: 'Voucher không tồn tại'
      };
    }

    // Check voucher status
    if (voucher.status !== 'active') {
      return {
        success: false,
        errorCode: 'VOUCHER_INACTIVE',
        message: 'Voucher không còn hiệu lực'
      };
    }

    // Check usage limit
    if (voucher.usageLimit && voucher.usageCount >= voucher.usageLimit) {
      return {
        success: false,
        errorCode: 'VOUCHER_USAGE_LIMIT_EXCEEDED',
        message: 'Voucher đã đạt giới hạn sử dụng'
      };
    }

    // Check minimum order value
    if (voucher.minOrderValue && originalPrice < voucher.minOrderValue) {
      return {
        success: false,
        errorCode: 'INVALID_MIN_ORDER_VALUE',
        message: `Đơn hàng phải có giá trị tối thiểu ${voucher.minOrderValue.toLocaleString()} VNĐ để sử dụng voucher này`
      };
    }

    // Check voucher validity period
    const startDate = new Date(voucher.startDate);
    const expiryDate = new Date(voucher.expiryDate);
    startDate.setHours(0, 0, 0, 0);
    expiryDate.setHours(23, 59, 59, 999);
    const normalizedCurrentDate = new Date(currentDate);
    normalizedCurrentDate.setHours(0, 0, 0, 0);

    if (normalizedCurrentDate < startDate || normalizedCurrentDate > expiryDate) {
      return {
        success: false,
        errorCode: 'VOUCHER_INVALID_DATE',
        message: 'Voucher không hợp lệ tại thời điểm hiện tại'
      };
    }

    // Calculate discount
    const discountAmount = voucher.calculateDiscount(originalPrice);

    return {
      success: true,
      discountAmount,
      voucher,
      message: 'Voucher valid',
      errorCode: null
    };
  } catch (error) {
    console.error('Error validating voucher:', error);
    return {
      success: false,
      errorCode: 'VOUCHER_VALIDATION_ERROR',
      message: 'Lỗi khi kiểm tra voucher'
    };
  }
}

module.exports = { validateVoucher };