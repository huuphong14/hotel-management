const express = require('express');
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  updateBookingStatus
} = require('../controllers/bookingController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(protect); // Tất cả routes đều yêu cầu đăng nhập

router.route('/')
  .post(createBooking)
  .get(getMyBookings);

router.put('/:id/cancel', cancelBooking);
router.put(
  '/:id/status',
  authorize('admin', 'hotel_owner'),
  updateBookingStatus
);

module.exports = router; 