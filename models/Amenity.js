const mongoose = require("mongoose");

const AmenitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Vui lòng nhập tên tiện ích"],
      trim: true,
      unique: true
    },
    type: {
      type: String,
      enum: ["hotel", "room"],
      required: [true, "Vui lòng chọn loại tiện ích"],
    },
    description: {
      type: String,
      trim: true
    },
    icon: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Amenity", AmenitySchema);