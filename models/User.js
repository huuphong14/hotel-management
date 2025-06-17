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
    type: {
      url: String,
      publicId: String,
      filename: String
    },
    default: {
      url: 'https://res.cloudinary.com/dssrbosuv/image/upload/v1728055710/samples/man-portrait.jpg',
      publicId: 'default_avatar',
      filename: 'default-avatar.jpg'
    }
  },
  role: {
    type: String,
    enum: ['user', 'partner', 'admin'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected'],
    default: 'active'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  provider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
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
  favoriteHotels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel'
  }],
  tier: {
    type: String,
    enum: ['Bronze', 'Silver', 'Gold'],
    default: 'Bronze'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

UserSchema.index({ role: 1 });

// Virtual fields
UserSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'user',
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

// Cấu hình ngưỡng hạng và thời gian tính toán
const TIER_CONFIG = {
  thresholds: {
    Bronze: 0,
    Silver: 5000000,
    Gold: 20000000
  },
  calculationPeriod: 6, // Số tháng tính toán
  downgradeGracePeriod: 3 // Số tháng cho phép giữ hạng khi không đạt ngưỡng
};

// Tính tổng số tiền đơn hàng trong khoảng thời gian cấu hình
UserSchema.methods.getTotalBookingAmount = async function() {
  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - TIER_CONFIG.calculationPeriod);

  const bookings = await mongoose.model('Booking').aggregate([
    {
      $match: {
        user: this._id, // ✅ Sửa từ userId thành user
        status: { $in: ['completed'] }, // ✅ Chỉ lấy completed
        createdAt: { $gte: monthsAgo }
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$finalPrice' }
      }
    }
  ]);

  return bookings.length > 0 ? bookings[0].totalAmount : 0;
};

// Cập nhật hạng người dùng dựa trên tổng số tiền
UserSchema.methods.updateTier = async function() {
  const totalAmount = await this.getTotalBookingAmount();
  const oldTier = this.tier;
  let newTier = 'Bronze';

  // Xác định hạng mới dựa trên tổng số tiền
  if (totalAmount >= TIER_CONFIG.thresholds.Gold) {
    newTier = 'Gold';
  } else if (totalAmount >= TIER_CONFIG.thresholds.Silver) {
    newTier = 'Silver';
  }

  // Xử lý trường hợp hạng giảm
  let isDowngraded = false;
  if (this.tier !== newTier && this.tier !== 'Bronze') {
    // Kiểm tra xem có đang trong thời gian gia hạn không
    const lastTierUpdate = this.updatedAt || this.createdAt;
    const monthsSinceLastUpdate = (Date.now() - lastTierUpdate) / (30 * 24 * 60 * 60 * 1000);

    if (monthsSinceLastUpdate < TIER_CONFIG.downgradeGracePeriod && newTier < this.tier) {
      // Giữ nguyên hạng cũ trong thời gian gia hạn
      newTier = this.tier;
    } else if (newTier < this.tier) {
      isDowngraded = true;
    }
  }

  if (this.tier !== newTier) {
    this.tier = newTier;
    await this.save();
  }

  return {
    oldTier,
    newTier,
    totalAmount,
    isDowngraded
  };
};

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
  const verificationToken = crypto.randomBytes(20).toString('hex');
  
  this.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  this.verificationTokenExpire = Date.now() + 24 * 60 * 60 * 1000;
  
  return verificationToken;
};

const User = mongoose.model('User', UserSchema);

// Export default User model và TIER_CONFIG như properties
User.TIER_CONFIG = TIER_CONFIG;

module.exports = User;