const Review = require('../models/Review');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');

// @desc    Tạo đánh giá mới
// @route   POST /api/reviews
// @access  Private
exports.createReview = async (req, res) => {
  try {
    const { hotelId, rating, title, comment, isAnonymous } = req.body;

    // Kiểm tra xem khách sạn có tồn tại không
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    // Kiểm tra xem user đã từng đặt phòng ở khách sạn này chưa
    const hasBooking = await Booking.findOne({
      userId: req.user.id,
      'room.hotelId': hotelId,
      status: 'completed'
    });

    if (!hasBooking) {
      return res.status(400).json({
        success: false,
        message: 'Bạn cần phải đặt phòng và hoàn thành lưu trú trước khi đánh giá'
      });
    }

    // Kiểm tra xem user đã đánh giá khách sạn này chưa
    const existingReview = await Review.findOne({
      userId: req.user.id,
      hotelId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'Bạn đã đánh giá khách sạn này rồi'
      });
    }

    // Tạo đánh giá mới
    const review = await Review.create({
      userId: req.user.id,
      hotelId,
      rating,
      title,
      comment,
      isAnonymous
    });

    // Populate thông tin user (trừ khi anonymous)
    await review.populate({
      path: 'userId',
      select: 'name'
    });

    res.status(201).json({
      success: true,
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server'
    });
  }
};

// @desc    Lấy tất cả đánh giá của một khách sạn
// @route   GET /api/hotels/:hotelId/reviews
// @access  Public
exports.getHotelReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ hotelId: req.params.hotelId })
      .populate({
        path: 'userId',
        select: 'name'
      })
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Cập nhật đánh giá
// @route   PUT /api/reviews/:id
// @access  Private
exports.updateReview = async (req, res) => {
  try {
    let review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đánh giá'
      });
    }

    // Kiểm tra quyền cập nhật
    if (review.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền cập nhật đánh giá này'
      });
    }

    // Cập nhật đánh giá
    review = await Review.findByIdAndUpdate(
      req.params.id,
      {
        rating: req.body.rating,
        title: req.body.title,
        comment: req.body.comment,
        isAnonymous: req.body.isAnonymous
      },
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server'
    });
  }
};

// @desc    Phản hồi đánh giá (dành cho chủ khách sạn)
// @route   PUT /api/reviews/:id/respond
// @access  Private (Hotel Owner/Admin)
exports.respondToReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đánh giá'
      });
    }

    // Kiểm tra quyền phản hồi
    const hotel = await Hotel.findById(review.hotelId);
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền phản hồi đánh giá này'
      });
    }

    review.response = req.body.response;
    await review.save();

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Xóa đánh giá
// @route   DELETE /api/reviews/:id
// @access  Private
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đánh giá'
      });
    }

    // Kiểm tra quyền xóa
    if (review.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền xóa đánh giá này'
      });
    }

    await review.remove();

    res.status(200).json({
      success: true,
      message: 'Đã xóa đánh giá'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
}; 