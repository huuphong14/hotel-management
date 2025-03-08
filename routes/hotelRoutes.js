const express = require('express');
const {
  createHotel,
  getHotels,
  getHotel,
  updateHotel,
  deleteHotel
} = require('../controllers/hotelController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();

// Public routes
router.get('/', getHotels);
router.get('/:id', getHotel);

// Protected routes
router.use(protect);
router.post('/', authorize('hotel_owner'), createHotel);
router.put('/:id', authorize('hotel_owner'), updateHotel);
router.delete('/:id', authorize('hotel_owner'), deleteHotel);

module.exports = router;