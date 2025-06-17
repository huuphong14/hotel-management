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
  checkIn: {
    type: Date,
    required: true
  },
  checkOut: {
    type: Date,
    required: true
  },
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
  voucher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voucher',
    validate: {
      validator: async function(voucherId) {
        if (!voucherId) return true;
        const Voucher = mongoose.model('Voucher');
        const voucher = await Voucher.findById(voucherId);
        return voucher && voucher.status === 'active';
      },
      message: 'Voucher không hợp lệ hoặc đã hết hạn'
    }
  },
  originalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: function(discount) {
        return discount <= this.originalPrice;
      },
      message: 'Số tiền giảm giá không thể lớn hơn giá gốc'
    }
  },
  finalPrice: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(finalPrice) {
        return finalPrice === this.originalPrice - this.discountAmount;
      },
      message: 'Giá cuối cùng không khớp với giá gốc trừ đi giảm giá'
    }
  },
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
  },
  retryCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastRetryAt: {
    type: Date
  }
}, {
  timestamps: true
});

bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ room: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ paymentId: 1 });
bookingSchema.index({ transactionId: 1 });
bookingSchema.index({ refundTransactionId: 1 });
bookingSchema.index({ status: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ retryCount: 1, lastRetryAt: 1 }); 
bookingSchema.index({ status: 1, paymentStatus: 1, createdAt: 1 });

bookingSchema.pre('save', function(next) {
  if (this.checkOut <= this.checkIn) {
    next(new Error('Ngày trả phòng phải sau ngày nhận phòng'));
  }
  
  if (this.bookingFor === 'other' && (!this.guestInfo || !this.guestInfo.name)) {
    next(new Error('Vui lòng cung cấp thông tin người lưu trú khi đặt phòng hộ'));
  }
  
  next();
});

bookingSchema.methods.calculateFinalPrice = async function() {
  if (!this.voucher) {
    this.discountAmount = 0;
    this.finalPrice = this.originalPrice;
    return;
  }

  const Voucher = mongoose.model('Voucher');
  const voucher = await Voucher.findById(this.voucher);
  
  if (!voucher || voucher.status !== 'active') {
    throw new Error('Voucher không hợp lệ hoặc đã hết hạn');
  }
  this.discountAmount = voucher.calculateDiscount(this.originalPrice);
  this.finalPrice = this.originalPrice - this.discountAmount;
};

bookingSchema.pre('save', async function(next) {
  try {
    if (this.isModified('originalPrice') || this.isModified('voucher')) {
      await this.calculateFinalPrice();
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Booking', bookingSchema);