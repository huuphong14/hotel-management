const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: [true, 'Vui lòng chọn khách sạn']
  },
  roomName: {
    type: String,
    required: [true, 'Vui lòng nhập tên phòng'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Vui lòng nhập mô tả phòng'],
    trim: true
  },
  floor: {
    type: Number,
    required: [true, 'Vui lòng chọn tầng'],
    min: [0, 'Tầng không thể âm']
  },
  roomType: {
    type: String,
    required: [true, 'Vui lòng chọn loại phòng'],
    enum: ['Standard', 'Superior', 'Deluxe', 'Suite', 'Family'],
    trim: true
  },
  bedType: {
    type: String,
    required: [true, 'Vui lòng chọn loại giường'],
    enum: ['Single', 'Twin', 'Double', 'Queen', 'King'],
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Vui lòng nhập giá phòng'],
    min: [0, 'Giá phòng không thể âm']
  },
  capacity: {
    type: Number,
    required: [true, 'Vui lòng nhập số lượng khách tối đa'],
    min: [1, 'Số lượng khách tối thiểu là 1'],
    max: [10, 'Số lượng khách tối đa là 10']
  },
  squareMeters: {
    type: Number,
    required: [true, 'Vui lòng nhập diện tích phòng'],
    min: [0, 'Diện tích phòng không thể âm']
  },
  amenities: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Amenity'
  }],
  images: [{
    url: String,
    publicId: String,
    filename: String
  }],
  cancellationPolicy: {
    type: String,
    required: [true, 'Vui lòng chọn chính sách hủy phòng'],
    enum: ['flexible', 'moderate', 'strict'],
    default: 'flexible'
  },
  discountPercent: {
    type: Number,
    min: [0, 'Phần trăm giảm giá không thể âm'],
    max: [100, 'Phần trăm giảm giá không thể vượt quá 100%'],
    default: 0
  },
  discountStartDate: {
    type: Date,
    default: null
  },
  discountEndDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    required: true,
    enum: ['available', 'booked', 'maintenance'],
    default: 'available'
  }
}, {
  timestamps: true // Tự động thêm createdAt và updatedAt
});

// Tạo index cho tìm kiếm
RoomSchema.index({ hotelId: 1, roomType: 1 });
RoomSchema.index({ price: 1 });
RoomSchema.index({ status: 1 });

module.exports = mongoose.model('Room', RoomSchema);
