const Review = require("../models/Review");
const Hotel = require("../models/Hotel");
const Booking = require("../models/Booking");

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Tạo đánh giá mới cho khách sạn
 *     tags: [Review]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hotelId
 *               - rating
 *             properties:
 *               hotelId:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               title:
 *                 type: string
 *               comment:
 *                 type: string
 *               isAnonymous:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Tạo đánh giá thành công
 *       400:
 *         description: Không đủ điều kiện đánh giá hoặc đã đánh giá rồi
 *       404:
 *         description: Không tìm thấy khách sạn
 *       500:
 *         description: Lỗi máy chủ
 */
exports.createReview = async (req, res) => {
  try {
    const { hotelId, rating, title, comment, isAnonymous } = req.body;

    // Kiểm tra xem khách sạn có tồn tại không
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      console.warn(`Không tìm thấy khách sạn với ID: ${hotelId}`);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn",
      });
    }

    // Kiểm tra xem người dùng có đặt phòng hoàn thành tại khách sạn này chưa
    const hasBooking = await Booking.findOne({
      user: req.user.id,
      status: "completed",
    }).populate({
      path: "room",
      select: "hotelId",
      match: { hotelId: hotelId },
    });

    if (!hasBooking || !hasBooking.room) {
      console.warn(
        `Không tìm thấy đặt phòng hoàn thành cho người dùng: ${req.user.id} tại khách sạn: ${hotelId}`
      );
      return res.status(400).json({
        success: false,
        message:
          "Bạn cần đặt phòng và hoàn thành lưu trú tại khách sạn trước khi đánh giá",
      });
    }

    // Kiểm tra xem người dùng đã đánh giá khách sạn này chưa
    const existingReview = await Review.findOne({
      userId: req.user.id,
      hotelId,
    });
    if (existingReview) {
      console.warn(
        `Người dùng: ${req.user.id} đã đánh giá khách sạn: ${hotelId}`
      );
      return res.status(400).json({
        success: false,
        message: "Bạn đã đánh giá khách sạn này rồi",
      });
    }

    // Tạo đánh giá mới
    const review = await Review.create({
      userId: req.user.id,
      hotelId,
      rating,
      title,
      comment,
      isAnonymous,
    });

    // Điền thông tin tên người dùng (trừ khi ẩn danh)
    await review.populate({ path: "userId", select: "name" });

    // Cập nhật điểm trung bình và số lượng đánh giá của khách sạn
    await Review.calculateAverageRating(hotelId);

    console.log(
      `Tạo đánh giá thành công cho khách sạn: ${hotelId} bởi người dùng: ${req.user.id}`
    );
    res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("Lỗi khi tạo đánh giá:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi máy chủ",
    });
  }
};

/**
 * @swagger
 * /api/reviews/{hotelId}:
 *   get:
 *     summary: Lấy tất cả đánh giá của một khách sạn
 *     tags: [Review]
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     responses:
 *       200:
 *         description: Lấy danh sách đánh giá thành công
 *       400:
 *         description: Thiếu hotelId trong yêu cầu
 *       500:
 *         description: Lỗi máy chủ
 */
exports.getHotelReviews = async (req, res) => {
  try {
    console.log(
      `Đang lấy đánh giá cho khách sạn với ID: ${req.params.hotelId}`
    );

    // Kiểm tra xem hotelId có được cung cấp không
    if (!req.params.hotelId) {
      console.error("Lỗi: Thiếu hotelId trong tham số yêu cầu");
      return res.status(400).json({
        success: false,
        message: "Thiếu hotelId trong yêu cầu",
      });
    }

    // Lấy tất cả đánh giá của khách sạn, sắp xếp theo thời gian tạo
    const reviews = await Review.find({ hotelId: req.params.hotelId })
      .populate({
        path: "userId",
        select: "name",
      })
      .sort("-createdAt");

    if (reviews.length === 0) {
      console.warn(
        `Không tìm thấy đánh giá nào cho khách sạn với ID: ${req.params.hotelId}`
      );
    }

    console.log(
      `Tìm thấy ${reviews.length} đánh giá cho khách sạn với ID: ${req.params.hotelId}`
    );

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    console.error(
      `Lỗi khi lấy đánh giá cho khách sạn với ID: ${req.params.hotelId}`,
      error
    );
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/reviews/{id}:
 *   put:
 *     summary: Cập nhật đánh giá
 *     tags: [Review]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID đánh giá
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: number
 *               title:
 *                 type: string
 *               comment:
 *                 type: string
 *               isAnonymous:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật đánh giá thành công
 *       403:
 *         description: Không có quyền cập nhật đánh giá
 *       404:
 *         description: Không tìm thấy đánh giá
 *       500:
 *         description: Lỗi máy chủ
 */
exports.updateReview = async (req, res) => {
  try {
    // Tìm đánh giá theo ID
    let review = await Review.findById(req.params.id);

    if (!review) {
      console.warn(`Không tìm thấy đánh giá với ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đánh giá",
      });
    }

    // Kiểm tra quyền cập nhật (chỉ người tạo hoặc admin)
    if (review.userId.toString() !== req.user.id && req.user.role !== "admin") {
      console.warn(
        `Người dùng ${req.user.id} không có quyền cập nhật đánh giá ${req.params.id}`
      );
      return res.status(403).json({
        success: false,
        message: "Không có quyền cập nhật đánh giá này",
      });
    }

    // Cập nhật thông tin đánh giá
    review = await Review.findByIdAndUpdate(
      req.params.id,
      {
        rating: req.body.rating,
        title: req.body.title,
        comment: req.body.comment,
        isAnonymous: req.body.isAnonymous,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    // Cập nhật điểm trung bình và số lượng đánh giá
    await Review.calculateAverageRating(review.hotelId);

    console.log(
      `Cập nhật đánh giá ${req.params.id} thành công bởi người dùng: ${req.user.id}`
    );
    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật đánh giá:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi máy chủ",
    });
  }
};

/**
 * @swagger
 * /api/reviews/{id}/respond:
 *   put:
 *     summary: Phản hồi đánh giá (dành cho chủ khách sạn hoặc admin)
 *     tags: [Review]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID đánh giá
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - response
 *             properties:
 *               response:
 *                 type: string
 *                 description: Nội dung phản hồi
 *     responses:
 *       200:
 *         description: Phản hồi đánh giá thành công
 *       403:
 *         description: Không có quyền phản hồi đánh giá
 *       404:
 *         description: Không tìm thấy đánh giá
 *       500:
 *         description: Lỗi máy chủ
 */
exports.respondToReview = async (req, res) => {
  try {
    // Tìm đánh giá theo ID
    const review = await Review.findById(req.params.id);

    if (!review) {
      console.warn(`Không tìm thấy đánh giá với ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đánh giá",
      });
    }

    // Kiểm tra quyền phản hồi (chỉ chủ khách sạn hoặc admin)
    const hotel = await Hotel.findById(review.hotelId);
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      console.warn(
        `Người dùng ${req.user.id} không có quyền phản hồi đánh giá ${req.params.id}`
      );
      return res.status(403).json({
        success: false,
        message: "Không có quyền phản hồi đánh giá này",
      });
    }

    // Lưu phản hồi
    review.response = req.body.response;
    await review.save();

    console.log(
      `Phản hồi cho đánh giá ${req.params.id} được thêm bởi người dùng: ${req.user.id}`
    );
    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("Lỗi khi phản hồi đánh giá:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
    });
  }
};

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Xóa đánh giá
 *     tags: [Review]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID đánh giá
 *     responses:
 *       200:
 *         description: Xóa đánh giá thành công
 *       403:
 *         description: Không có quyền xóa đánh giá
 *       404:
 *         description: Không tìm thấy đánh giá
 *       500:
 *         description: Lỗi máy chủ
 */
exports.deleteReview = async (req, res) => {
  try {
    console.log(
      `Đang cố gắng xóa đánh giá với ID: ${req.params.id} bởi người dùng: ${req.user.id}`
    );

    // Tìm đánh giá theo ID
    const review = await Review.findById(req.params.id);

    if (!review) {
      console.warn(`Không tìm thấy đánh giá với ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đánh giá",
      });
    }

    // Kiểm tra quyền xóa (chỉ người tạo hoặc admin)
    if (review.userId.toString() !== req.user.id && req.user.role !== "admin") {
      console.warn(
        `Người dùng ${req.user.id} không có quyền xóa đánh giá ${req.params.id}`
      );
      return res.status(403).json({
        success: false,
        message: "Không có quyền xóa đánh giá này",
      });
    }

    // Xóa đánh giá
    await review.deleteOne();

    // Cập nhật điểm trung bình và số lượng đánh giá
    await Review.calculateAverageRating(review.hotelId);

    console.log(`Xóa đánh giá với ID: ${req.params.id} thành công`);

    res.status(200).json({
      success: true,
      message: "Đã xóa đánh giá",
    });
  } catch (error) {
    console.error(`Lỗi khi xóa đánh giá với ID: ${req.params.id}`, error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi máy chủ",
    });
  }
};
