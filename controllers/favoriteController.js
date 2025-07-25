// controllers/favoriteController.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Hotel = require("../models/Hotel");

/**
 * @swagger
 * /api/favorites:
 *   post:
 *     summary: "Thêm khách sạn vào danh sách yêu thích"
 *     tags: [Favorite]
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
 *             properties:
 *               hotelId:
 *                 type: string
 *                 description: "ID khách sạn"
 *     responses:
 *       200:
 *         description: "Đã thêm khách sạn vào danh sách yêu thích"
 *       400:
 *         description: "Khách sạn đã có trong danh sách yêu thích"
 *       404:
 *         description: "Không tìm thấy khách sạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.addFavorite = async (req, res) => {
  try {
    const { hotelId } = req.body;
    const userId = req.user.id;

    // Kiểm tra xem khách sạn có tồn tại không
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn",
      });
    }

    // Tìm và cập nhật user, thêm khách sạn vào danh sách yêu thích nếu chưa có
    const user = await User.findById(userId);

    // Kiểm tra xem khách sạn đã có trong danh sách yêu thích chưa
    if (user.favoriteHotels.includes(hotelId)) {
      return res.status(400).json({
        success: false,
        message: "Khách sạn đã có trong danh sách yêu thích",
      });
    }

    // Thêm khách sạn vào danh sách yêu thích
    user.favoriteHotels.push(hotelId);
    await user.save();

    // Tăng số lượt yêu thích của khách sạn
    hotel.favoriteCount = (hotel.favoriteCount || 0) + 1;
    await hotel.save();

    return res.status(200).json({
      success: true,
      message: "Đã thêm khách sạn vào danh sách yêu thích",
      data: user.favoriteHotels,
    });
  } catch (error) {
    console.error("Lỗi khi thêm khách sạn yêu thích:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/favorites/{hotelId}:
 *   delete:
 *     summary: "Xóa khách sạn khỏi danh sách yêu thích"
 *     tags: [Favorite]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID khách sạn"
 *     responses:
 *       200:
 *         description: "Đã xóa khách sạn khỏi danh sách yêu thích"
 *       400:
 *         description: "Khách sạn không có trong danh sách yêu thích"
 *       500:
 *         description: "Lỗi server"
 */
exports.removeFavorite = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const userId = req.user.id;

    // Tìm và cập nhật user, xóa khách sạn khỏi danh sách yêu thích
    const user = await User.findById(userId);

    // Kiểm tra xem khách sạn có trong danh sách yêu thích không
    if (!user.favoriteHotels.includes(hotelId)) {
      return res.status(400).json({
        success: false,
        message: "Khách sạn không có trong danh sách yêu thích",
      });
    }

    // Xóa khách sạn khỏi danh sách yêu thích
    user.favoriteHotels = user.favoriteHotels.filter(
      (hotel) => hotel.toString() !== hotelId
    );
    await user.save();

    // Giảm số lượt yêu thích của khách sạn
    const hotel = await Hotel.findById(hotelId);
    if (hotel) {
      hotel.favoriteCount = Math.max(0, (hotel.favoriteCount || 1) - 1);
      await hotel.save();
    }

    return res.status(200).json({
      success: true,
      message: "Đã xóa khách sạn khỏi danh sách yêu thích",
      data: user.favoriteHotels,
    });
  } catch (error) {
    console.error("Lỗi khi xóa khách sạn yêu thích:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: "Lấy danh sách khách sạn yêu thích của người dùng"
 *     tags: [Favorite]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Lấy danh sách khách sạn yêu thích thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user.id;

    // Tìm user và populate danh sách khách sạn yêu thích
    const user = await User.findById(userId).populate({
      path: "favoriteHotels",
    });

    return res.status(200).json({
      success: true,
      count: user.favoriteHotels.length,
      data: user.favoriteHotels,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách khách sạn yêu thích:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/favorites/check/{hotelId}:
 *   get:
 *     summary: "Kiểm tra một khách sạn có trong danh sách yêu thích không"
 *     tags: [Favorite]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID khách sạn"
 *     responses:
 *       200:
 *         description: "Kết quả kiểm tra yêu thích"
 *       500:
 *         description: "Lỗi server"
 */
exports.checkFavorite = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);
    const isFavorite = user.favoriteHotels.includes(hotelId);

    return res.status(200).json({
      success: true,
      isFavorite,
    });
  } catch (error) {
    console.error("Lỗi khi kiểm tra khách sạn yêu thích:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/favorites/popular:
 *   get:
 *     summary: "Lấy danh sách khách sạn được yêu thích nhiều nhất" 
 *     tags: [Favorite]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: "Trang"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: "Số lượng mỗi trang"
 *     responses:
 *       200:
 *         description: "Lấy danh sách khách sạn phổ biến thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getPopularHotels = async (req, res) => {
  try {
    // Lấy tham số từ query
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Tìm khách sạn có trạng thái active, sắp xếp theo favoriteCount giảm dần
    const hotels = await Hotel.find({ status: "active" })
      .sort({ favoriteCount: -1 })
      .skip(skip)
      .limit(limit)
      .select("name address rating description featuredImage favoriteCount");

    // Đếm tổng số khách sạn để phân trang
    const total = await Hotel.countDocuments({ status: "active" });

    return res.status(200).json({
      success: true,
      count: hotels.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: hotels,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách khách sạn phổ biến:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};
