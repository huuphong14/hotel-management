const express = require('express');
const { createRoom, getRooms, getRoom, updateRoom, deleteRoom } = require('../controllers/roomController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();

// Public routes - Không cần đăng nhập
router.get('/hotel/:hotelId/rooms', getRooms); // Lấy danh sách phòng theo khách sạn
router.get('/:id', getRoom); // Xem chi tiết một phòng

// Protected routes - Cần đăng nhập và phân quyền
router.use(protect);
router.post('/hotel/:hotelId', authorize('hotel_owner'), createRoom);
router.put('/:id', authorize('hotel_owner'), updateRoom);
router.delete('/:id', authorize('hotel_owner'), deleteRoom);

module.exports = router;
