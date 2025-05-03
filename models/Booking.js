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
  // Contact Information
  bookingFor: {
    type: String,
    enum: ['self', 'other'],
    default: 'self'
  },
  contactInfo: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    }
  },
  // Guest information (when booking for someone else)
  guestInfo: {
    name: {
      type: String
    },
    email: {
      type: String
    },
    phone: {
      type: String
    }
  },
  // Dates
  checkIn: {
    type: Date,
    required: true
  },
  checkOut: {
    type: Date,
    required: true
  },
  // Special requests
  specialRequests: {
    earlyCheckIn: {
      type: Boolean,
      default: false
    },
    lateCheckOut: {
      type: Boolean,
      default: false
    },
    additionalRequests: {
      type: String,
      default: ''
    }
  },
  // Financial information
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
  // Status fields
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['zalopay', 'vnpay', 'credit_card', 'paypal'],
    default: 'zalopay'
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
    type: String
  },
  // Payment transaction information
  transactionId: {
    type: String
  },
  refundTransactionId: {
    type: String
  },
  refundStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: null
  },
  refundAmount: {
    type: Number
  },
  refundTimestamp: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ room: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ paymentId: 1 });
bookingSchema.index({ transactionId: 1 });
bookingSchema.index({ refundTransactionId: 1 });

// Middleware để kiểm tra ngày
bookingSchema.pre('save', function(next) {
  // Kiểm tra ngày check-out phải sau ngày check-in
  if (this.checkOut <= this.checkIn) {
    next(new Error('Ngày trả phòng phải sau ngày nhận phòng'));
  }
  
  // Kiểm tra thông tin khách khi đặt hộ người khác
  if (this.bookingFor === 'other' && (!this.guestInfo || !this.guestInfo.name)) {
    next(new Error('Vui lòng cung cấp thông tin người lưu trú khi đặt phòng hộ'));
  }
  
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);