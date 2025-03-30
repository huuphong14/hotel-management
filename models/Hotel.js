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
    locationName: { 
      type: String,
      required: [true, 'Vui lòng nhập tên điểm du lịch']
    },
    locationDescription: {
      type: String,
      trim: true
    },
    location: {
      type: { 
        type: String, 
        enum: ['Point'], 
        default: 'Point' 
      },
      coordinates: { 
        type: [Number], 
        //required: [true, 'Vui lòng nhập tọa độ']
      } // [longitude, latitude]
    },
    rating: { 
      type: Number, 
      default: 0,
      min: [0, 'Đánh giá không thể nhỏ hơn 0'],
      max: [5, 'Đánh giá không thể lớn hơn 5']
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
      type: String
    },
    images: [{ 
      type: String 
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
    status: { 
      type: String,
      enum: ['active', 'inactive', 'pending'],
      default: 'pending'
    }
  },
  { 
    timestamps: true // Tự động thêm createdAt và updatedAt
  }
);

// Tạo index cho location để hỗ trợ tìm kiếm theo vị trí
HotelSchema.index({ location: "2dsphere" });

// Tạo index cho tìm kiếm theo tên
HotelSchema.index({ name: 'text' });

module.exports = mongoose.model("Hotel", HotelSchema);
