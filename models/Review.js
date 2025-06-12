const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vui lòng chọn người dùng']
  },
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: [true, 'Vui lòng chọn khách sạn']
  },
  rating: {
    type: Number,
    required: [true, 'Vui lòng chọn điểm đánh giá'],
    min: [1, 'Điểm đánh giá tối thiểu là 1'],
    max: [5, 'Điểm đánh giá tối đa là 5']
  },
  title: {
    type: String,
    required: [true, 'Vui lòng nhập tiêu đề'],
    trim: true,
    maxlength: [100, 'Tiêu đề không được vượt quá 100 ký tự']
  },
  comment: {
    type: String,
    required: [true, 'Vui lòng nhập nội dung đánh giá'],
    trim: true,
    maxlength: [500, 'Nội dung không được vượt quá 500 ký tự']
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  response: {
    type: String,
    trim: true,
    maxlength: [500, 'Phản hồi không được vượt quá 500 ký tự']
  }
}, {
  timestamps: true
});

ReviewSchema.index({ hotelId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, hotelId: 1 }, { unique: true });

ReviewSchema.statics.calculateAverageRating = async function(hotelId) {
  const stats = await this.aggregate([
    {
      $match: { hotelId: hotelId }
    },
    {
      $group: {
        _id: '$hotelId',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  try {
    await mongoose.model('Hotel').findByIdAndUpdate(hotelId, {
      rating: stats[0]?.averageRating || 0,
      reviewCount: stats[0]?.reviewCount || 0
    });
  } catch (err) {
    console.error(err);
  }
};

ReviewSchema.post('save', function() {
  this.constructor.calculateAverageRating(this.hotelId);
});

ReviewSchema.pre('remove', function() {
  this.constructor.calculateAverageRating(this.hotelId);
});

module.exports = mongoose.model('Review', ReviewSchema);