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
  transactionId: {  // Add this field
    type: String,
    required: true,
    unique: true
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['zalopay', 'credit_card', 'paypal'],
    default: 'zalopay'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ bookingId: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);