const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  checkIn: {
    type: Date,
    required: true
  },
  checkOut: {
    type: Date,
    required: true
  },
  voucher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voucher'
  },
  originalPrice: {
    type: Number,
    required: true
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  finalPrice: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Tạo index cho tìm kiếm
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ room: 1, checkIn: 1, checkOut: 1 });

// Middleware để kiểm tra ngày
bookingSchema.pre('save', function(next) {
  // Kiểm tra ngày check-out phải sau ngày check-in
  if (this.checkOut <= this.checkIn) {
    next(new Error('Ngày trả phòng phải sau ngày nhận phòng'));
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema); 