// controllers/favoriteController.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Hotel = require('../models/Hotel');

// Thêm khách sạn vào danh sách yêu thích
exports.addFavorite = async (req, res) => {
  try {
    const { hotelId } = req.body;
    const userId = req.user.id;

    // Kiểm tra xem khách sạn có tồn tại không
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách sạn'
      });
    }

    // Tìm và cập nhật user, thêm khách sạn vào danh sách yêu thích nếu chưa có
    const user = await User.findById(userId);
    
    // Kiểm tra xem khách sạn đã có trong danh sách yêu thích chưa
    if (user.favoriteHotels.includes(hotelId)) {
      return res.status(400).json({
        success: false,
        message: 'Khách sạn đã có trong danh sách yêu thích'
      });
    }

    // Thêm khách sạn vào danh sách yêu thích
    user.favoriteHotels.push(hotelId);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Đã thêm khách sạn vào danh sách yêu thích',
      data: user.favoriteHotels
    });
  } catch (error) {
    console.error('Lỗi khi thêm khách sạn yêu thích:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// Xóa khách sạn khỏi danh sách yêu thích
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
        message: 'Khách sạn không có trong danh sách yêu thích'
      });
    }

    // Xóa khách sạn khỏi danh sách yêu thích
    user.favoriteHotels = user.favoriteHotels.filter(
      hotel => hotel.toString() !== hotelId
    );
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Đã xóa khách sạn khỏi danh sách yêu thích',
      data: user.favoriteHotels
    });
  } catch (error) {
    console.error('Lỗi khi xóa khách sạn yêu thích:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// Lấy danh sách khách sạn yêu thích của người dùng
exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user.id;

    // Tìm user và populate danh sách khách sạn yêu thích
    const user = await User.findById(userId)
      .populate({
        path: 'favoriteHotels'
      });

    return res.status(200).json({
      success: true,
      count: user.favoriteHotels.length,
      data: user.favoriteHotels
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách khách sạn yêu thích:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// Kiểm tra xem một khách sạn có trong danh sách yêu thích không
exports.checkFavorite = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);
    const isFavorite = user.favoriteHotels.includes(hotelId);

    return res.status(200).json({
      success: true,
      isFavorite
    });
  } catch (error) {
    console.error('Lỗi khi kiểm tra khách sạn yêu thích:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};
