const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  discount: {
    type: Number,
    required: true,
    min: 0
  },
  expiryDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  usageLimit: {
    type: Number,
    default: null // null là không giới hạn
  },
  usageCount: {
    type: Number,
    default: 0
  },
  minOrderValue: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    enum: ['room', 'service'], // Phân loại voucher cho phòng hoặc dịch vụ
    required: true
  },
  discountType: {
    type: String,
    enum: ['fixed', 'percentage'], // Giảm giá cố định hoặc theo phần trăm
    required: true
  },
  maxDiscount: {
    type: Number, // Giới hạn số tiền giảm tối đa cho voucher phần trăm
    default: null
  }
}, {
  timestamps: true
});

// Phương thức kiểm tra voucher có thể sử dụng
voucherSchema.methods.isValid = function(orderValue) {
  const now = new Date();
  return (
    this.status === 'active' &&
    now <= this.expiryDate &&
    (this.usageLimit === null || this.usageCount < this.usageLimit) &&
    orderValue >= this.minOrderValue
  );
};

// Thêm phương thức tính số tiền giảm
voucherSchema.methods.calculateDiscount = function(originalPrice) {
  if (this.discountType === 'fixed') {
    return this.discount;
  } else {
    const percentageDiscount = (originalPrice * this.discount) / 100;
    return this.maxDiscount ? Math.min(percentageDiscount, this.maxDiscount) : percentageDiscount;
  }
};

module.exports = mongoose.model('Voucher', voucherSchema); 