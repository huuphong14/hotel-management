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
  try {
    console.log(`Calculating average rating for hotel: ${hotelId}`);
    
    // Chuyển đổi hotelId thành ObjectId nếu cần
    const objectId = mongoose.Types.ObjectId.isValid(hotelId) 
      ? new mongoose.Types.ObjectId(hotelId) 
      : hotelId;

    const stats = await this.aggregate([
      {
        $match: { hotelId: objectId }
      },
      {
        $group: {
          _id: '$hotelId',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 }
        }
      }
    ]);

    console.log(`Aggregation result:`, stats);

    // Cập nhật thông tin hotel
    const updateData = {
      rating: stats.length > 0 ? Math.round(stats[0].averageRating * 10) / 10 : 0,
      reviewCount: stats.length > 0 ? stats[0].reviewCount : 0
    };

    console.log(`Updating hotel ${hotelId} with:`, updateData);

    const result = await mongoose.model('Hotel').findByIdAndUpdate(
      hotelId, 
      updateData,
      { new: true }
    );

    console.log(`Hotel update result:`, result ? 'Success' : 'Failed');
    
    return result;
  } catch (err) {
    console.error('Error calculating average rating:', err);
    throw err;
  }
};

// Middleware để tự động cập nhật rating sau khi save
ReviewSchema.post('save', async function() {
  try {
    await this.constructor.calculateAverageRating(this.hotelId);
  } catch (error) {
    console.error('Error in post save middleware:', error);
  }
});

// Middleware để tự động cập nhật rating sau khi xóa
ReviewSchema.post('deleteOne', { document: true }, async function() {
  try {
    await this.constructor.calculateAverageRating(this.hotelId);
  } catch (error) {
    console.error('Error in post deleteOne middleware:', error);
  }
});

// Middleware cho findOneAndDelete
ReviewSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    try {
      await doc.constructor.calculateAverageRating(doc.hotelId);
    } catch (error) {
      console.error('Error in post findOneAndDelete middleware:', error);
    }
  }
});

module.exports = mongoose.model('Review', ReviewSchema);