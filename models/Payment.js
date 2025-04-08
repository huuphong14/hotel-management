const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  // ID giao dịch nội bộ (app_trans_id) - giữ nguyên tên trường để tương thích ngược
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  // ID giao dịch từ ZaloPay (zp_trans_id)
  zpTransId: {
    type: String,
    index: true
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['zalopay', 'credit_card', 'paypal'],
    default: 'zalopay'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'refunding', 'refund_failed'],
    default: 'pending'
  },
  // Thêm các trường cho hoàn tiền
  refundTransactionId: {
    type: String
  },
  zaloRefundId: {
    type: String
  },
  refundTimestamp: {
    type: Date
  },
  refundAmount: {
    type: Number
  },
  refundFailReason: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ zpTransId: 1 });
paymentSchema.index({ refundTransactionId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);