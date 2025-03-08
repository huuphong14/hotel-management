const express = require('express');
const { createRoom, getRooms, getRoom, updateRoom, deleteRoom } = require('../controllers/roomController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();

router.get('/:hotelId/rooms', getRooms);

router.get('/rooms/:roomId', getRoom);

router.use(protect);

router.post('/:hotelId/rooms', authorize('hotel_owner'), createRoom);

router.put('/rooms/:roomId', authorize('hotel_owner'), updateRoom);

router.delete('/rooms/:roomId', authorize('hotel_owner'), deleteRoom);

module.exports = router;
