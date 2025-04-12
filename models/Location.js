const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Vui lòng nhập tên địa điểm'],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  image: {
    url: String,
    publicId: String,
    filename: String
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Tạo index cho tìm kiếm theo tên
LocationSchema.index({ name: 'text' });

module.exports = mongoose.model('Location', LocationSchema);