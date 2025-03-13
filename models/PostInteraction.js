const mongoose = require('mongoose');

const PostInteractionSchema = new mongoose.Schema({
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: [true, 'Vui lòng chọn bài viết']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vui lòng chọn người dùng']
  },
  type: {
    type: String,
    enum: ['like', 'comment'],
    required: [true, 'Vui lòng chọn loại tương tác']
  },
  content: {
    type: String,
    required: function() {
      return this.type === 'comment';
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PostInteraction', PostInteractionSchema); 