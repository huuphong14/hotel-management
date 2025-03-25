const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['booking', 'room', 'voucher', 'admin'],
    required: true
  },
  status: {
    type: String,
    enum: ['unread', 'read'],
    default: 'unread'
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'refModel'
  },
  refModel: {
    type: String,
    enum: ['Booking', 'Room', 'Voucher']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema); 