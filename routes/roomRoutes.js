const express = require('express');
const { createRoom, getRooms, getRoom, updateRoom, deleteRoom, searchRooms } = require('../controllers/roomController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();

// Public routes - Không cần đăng nhập
router.get('/search', searchRooms);
router.get('/hotels/:hotelId/rooms', getRooms);
router.get('/:id', getRoom); // Xem chi tiết một phòng


// Protected routes - Cần đăng nhập và phân quyền
router.use(protect);
router.post('/hotels/:hotelId/rooms', authorize('partner'), createRoom);
router.put('/:id', authorize('partner'), updateRoom);
router.delete('/:id', authorize('partner'), deleteRoom);

module.exports = router;
