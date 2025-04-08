// routes/favoriteRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth'); 
const favoriteController = require('../controllers/favoriteController');

router.use(protect);
// Route thêm khách sạn vào danh sách yêu thích
router.post('/favorites', favoriteController.addFavorite);

// Route xóa khách sạn khỏi danh sách yêu thích
router.delete('/favorites/:hotelId', favoriteController.removeFavorite);

// Route lấy danh sách khách sạn yêu thích
router.get('/favorites', favoriteController.getFavorites);

// Route kiểm tra khách sạn có trong danh sách yêu thích không
router.get('/favorites/:hotelId', favoriteController.checkFavorite);

module.exports = router;