// routes/favoriteRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth'); 
const favoriteController = require('../controllers/favoriteController');

// Route lấy danh sách khách sạn được yêu thích nhiều nhất (không cần đăng nhập)
router.get('/popular-hotels', favoriteController.getPopularHotels);

// Các route yêu cầu đăng nhập
router.use(protect);

// Route thêm khách sạn vào danh sách yêu thích
router.post('/', favoriteController.addFavorite);

// Route xóa khách sạn khỏi danh sách yêu thích
router.delete('/:hotelId', favoriteController.removeFavorite);

// Route lấy danh sách khách sạn yêu thích của người dùng hiện tại
router.get('/', favoriteController.getFavorites);

// Route kiểm tra khách sạn có trong danh sách yêu thích không
router.get('/:hotelId', favoriteController.checkFavorite);

module.exports = router;