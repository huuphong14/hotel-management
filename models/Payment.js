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
  // ID giao dịch nội bộ (app_trans_id cho ZaloPay, vnp_TxnRef cho VNPay)
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  // ID giao dịch từ cổng thanh toán
  zpTransId: {
    type: String,
    index: true
  },
  vpnTransId: {
    type: String,
    index: true
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['zalopay', 'vnpay', 'credit_card', 'paypal'],
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
  vnpRefundId: {
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
  },
  // Thêm các trường cho VNPay
  vnpResponseCode: {
    type: String
  },
  vnpResponseMessage: {
    type: String
  },
  vnpPayDate: {
    type: String
  },
  vnpBankCode: {
    type: String
  },
  vnpCardType: {
    type: String
  },
  vnpOrderInfo: {
    type: String
  },
  vnpTransactionType: {
    type: String
  },
  vnpTransactionStatus: {
    type: String
  },
  vnpTxnRef: {
    type: String
  },
  vnpSecureHash: {
    type: String
  },
  vnpSecureHashType: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ zpTransId: 1 });
paymentSchema.index({ vpnTransId: 1 });
paymentSchema.index({ refundTransactionId: 1 });
paymentSchema.index({ vnpTxnRef: 1 });

module.exports = mongoose.model('Payment', paymentSchema);