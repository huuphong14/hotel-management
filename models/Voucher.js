const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  discount: {
    type: Number,
    required: true,
    min: 0
  },
  startDate: {  // Thêm ngày bắt đầu có hiệu lực
    type: Date,
    required: true,
    default: Date.now
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

// Phương thức kiểm tra voucher có thể sử dụng - cập nhật để kiểm tra ngày bắt đầu
voucherSchema.methods.isValid = function(orderValue) {
  const now = new Date();
  
  if (!orderValue) {
    orderValue = 0;
  }
  
  return (
    this.status === 'active' &&
    now >= this.startDate &&  // Kiểm tra đã đến ngày bắt đầu
    now <= this.expiryDate &&
    (this.usageLimit === null || this.usageCount < this.usageLimit) &&
    orderValue >= this.minOrderValue
  );
};

// Các phương thức khác không thay đổi
voucherSchema.methods.calculateDiscount = function(originalPrice) {
  if (!originalPrice || originalPrice <= 0) {
    return 0;
  }
  
  if (this.discountType === 'fixed') {
    return this.discount;
  } else {
    const percentageDiscount = (originalPrice * this.discount) / 100;
    return this.maxDiscount ? Math.min(percentageDiscount, this.maxDiscount) : percentageDiscount;
  }
};

// Middleware trước khi lưu để đảm bảo các trường đúng định dạng
voucherSchema.pre('save', function(next) {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase().trim();
  }
  
  if (this.discountType === 'percentage' && this.discount > 100) {
    this.discount = 100; // Giới hạn giảm giá theo phần trăm không vượt quá 100%
  }
  
  if (this.discountType === 'fixed') {
    this.maxDiscount = null; // Xóa maxDiscount nếu là voucher giảm giá cố định
  }
  
  // Kiểm tra startDate và expiryDate
  if (this.startDate && this.expiryDate && this.startDate > this.expiryDate) {
    this.startDate = this.expiryDate; // Đảm bảo ngày bắt đầu không sau ngày kết thúc
  }
  
  next();
});

// Thêm phương thức tăng số lần sử dụng
voucherSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  return this.save();
};

module.exports = mongoose.model('Voucher', voucherSchema);