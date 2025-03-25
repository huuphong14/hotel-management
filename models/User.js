const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Vui lòng nhập tên người dùng'],
    trim: true,
    maxlength: [50, 'Tên không được vượt quá 50 ký tự']
  },
  email: {
    type: String,
    required: [true, 'Vui lòng nhập email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Email không hợp lệ'
    ]
  },
  phone: {
    type: String,
    match: [
      /^(\+?\d{1,3})?[-.\s]?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})$/,
      'Số điện thoại không hợp lệ'
    ]
  },
  password: {
    type: String,
    required: [true, 'Vui lòng nhập mật khẩu'],
    minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự'],
    select: false
  },
  avatar: {
    type: String,
    default: 'default-avatar.jpg'
  },
  role: {
    type: String,
    enum: ['user', 'partner', 'admin'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected'],
    default: 'active' // mặc định active cho user thường, pending cho partner
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpire: {
    type: Date
  },  
  refreshToken: {
    type: String,
    select: false
  },
  verificationToken: String,
  verificationTokenExpire: Date,
  partnerInfo: {
    businessName: String,
    businessAddress: String,
    taxCode: String,
    phoneNumber: String,
    description: String,
    documents: [String], // URL của các giấy tờ
    rejectionReason: String // Lý do từ chối nếu có
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes để tìm kiếm hiệu quả
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });

// Virtual fields
UserSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'userId',
  justOne: false
});

UserSchema.virtual('hotels', {
  ref: 'Hotel',
  localField: '_id',
  foreignField: 'ownerId',
  justOne: false
});

UserSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'userId',
  justOne: false
});

// Hash password trước khi lưu
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// So sánh password
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Tạo JWT token
UserSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Tạo Access Token
UserSchema.methods.getAccessToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRE }
  );
};

// Tạo Refresh Token
UserSchema.methods.getRefreshToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE }
  );
};

// Tạo token xác thực email
UserSchema.methods.getVerificationToken = function() {
  // Tạo token
  const verificationToken = crypto.randomBytes(20).toString('hex');
  
  // Hash token và set vào field verificationToken
  this.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  // Set thời gian hết hạn (24 giờ)
  this.verificationTokenExpire = Date.now() + 24 * 60 * 60 * 1000;
  
  return verificationToken;
};

module.exports = mongoose.model('User', UserSchema);