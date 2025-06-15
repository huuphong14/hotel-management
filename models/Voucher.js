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
  startDate: {
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
    default: null
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
    enum: ['fixed', 'percentage'],
    required: true
  },
  maxDiscount: {
    type: Number,
    default: null
  },
  applicableTiers: [{
    type: String,
    enum: ['Bronze', 'Silver', 'Gold'],
    default: ['Bronze', 'Silver', 'Gold']
  }],
  usedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

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
    this.discount = 100;
  }
  
  if (this.discountType === 'fixed') {
    this.maxDiscount = null;
  }
  
  if (this.startDate && this.expiryDate && this.startDate > this.expiryDate) {
    this.startDate = this.expiryDate;
  }
  
  next();
});

// Thêm phương thức tăng số lần sử dụng
voucherSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  return this.save();
};

// Thêm phương thức kiểm tra người dùng đã sử dụng voucher chưa
voucherSchema.methods.hasUserUsed = function(userId) {
  return this.usedBy.includes(userId);
};

// Thêm phương thức đánh dấu người dùng đã sử dụng voucher
voucherSchema.methods.markAsUsedBy = async function(userId) {
  if (!this.hasUserUsed(userId)) {
    this.usedBy.push(userId);
    await this.incrementUsage();
    return this.save();
  }
  return this;
};

module.exports = mongoose.model('Voucher', voucherSchema);