const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vui lòng chọn người đăng']
  },
  title: {
    type: String,
    required: [true, 'Vui lòng nhập tiêu đề'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'Vui lòng nhập nội dung'],
    trim: true
  },
  images: [{
    url: String,
    publicId: String,
    filename: String
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Tạo index cho tìm kiếm theo tiêu đề
PostSchema.index({ title: 'text' });

module.exports = mongoose.model('Post', PostSchema);