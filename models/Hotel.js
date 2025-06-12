const mongoose = require("mongoose");

const HotelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vui lòng nhập tên khách sạn'],
      trim: true
    },
    address: {
      type: String,
      required: [true, 'Vui lòng nhập địa chỉ']
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Vui lòng chọn địa điểm du lịch']
    },
    locationDescription: {
      type: String,
      trim: true
    },
    rating: {
      type: Number,
      default: 0,
      min: [0, 'Đánh giá không thể nhỏ hơn 0'],
      max: [5, 'Đánh giá không thể lớn hơn 5']
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: [0, 'Số lượng đánh giá không thể nhỏ hơn 0']
    },
    description: {
      type: String,
      trim: true,
      required: [true, 'Vui lòng nhập mô tả khách sạn']
    },
    ownerId: {
      type: String,
      required: [true, 'Vui lòng chọn chủ khách sạn']
    },
    website: {
      type: String,
      trim: true
    },
    featuredImage: {
      url: String,
      publicId: String,
      filename: String
    },
    images: [{
      url: String,
      publicId: String,
      filename: String
    }],
    amenities: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Amenity'
    }],
    policies: {
      checkInTime: {
        type: String,
        default: "14:00"
      },
      checkOutTime: {
        type: String,
        default: "12:00"
      },
      cancellationPolicy: {
        type: String,
        enum: ['24h-full-refund', '24h-half-refund', 'no-refund'],
        default: 'no-refund'
      },
      childrenPolicy: {
        type: String,
        enum: ['yes', 'no'],
        default: 'no'
      },
      petPolicy: {
        type: String,
        enum: ['yes', 'no'],
        default: 'no'
      },
      smokingPolicy: {
        type: String,
        enum: ['yes', 'no'],
        default: 'no'
      }
    },
    favoriteCount: {
      type: Number,
      default: 0
    },
    lowestPrice: {
      type: Number,
      default: 0
    },
    lowestDiscountedPrice: {
      type: Number,
      default: 0
    },
    highestDiscountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

HotelSchema.index({ name: 'text' });
HotelSchema.index({ locationId: 1, status: 1 });
HotelSchema.index({ rating: 1 });

module.exports = mongoose.model("Hotel", HotelSchema);