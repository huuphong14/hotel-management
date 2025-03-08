const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vui lòng chọn khách hàng']
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: [true, 'Vui lòng chọn phòng']
  },
  checkInDate: {
    type: Date,
    required: [true, 'Vui lòng chọn ngày nhận phòng']
  },
  checkOutDate: {
    type: Date,
    required: [true, 'Vui lòng chọn ngày trả phòng']
  },
  totalPrice: {
    type: Number,
    required: [true, 'Vui lòng nhập tổng giá tiền'],
    min: [0, 'Tổng giá tiền không thể âm']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'checked-in', 'completed', 'no-show'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Tạo index cho tìm kiếm
BookingSchema.index({ userId: 1, status: 1 });
BookingSchema.index({ roomId: 1, checkInDate: 1, checkOutDate: 1 });

// Middleware để kiểm tra ngày
BookingSchema.pre('save', function(next) {
  // Kiểm tra ngày check-out phải sau ngày check-in
  if (this.checkOutDate <= this.checkInDate) {
    next(new Error('Ngày trả phòng phải sau ngày nhận phòng'));
  }
  next();
});

module.exports = mongoose.model('Booking', BookingSchema); 