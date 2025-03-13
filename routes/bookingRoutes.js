const express = require('express');
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  updateBookingStatus
} = require('../controllers/bookingController');
const { protect} = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();

router.use(protect); // Tất cả routes đều yêu cầu đăng nhập

router.route('/')
  .post(createBooking)
  .get(getMyBookings);

router.patch('/:id/status/cancel', cancelBooking);
router.patch('/:id/status/update', authorize('admin', 'hotel_owner'), updateBookingStatus);

module.exports = router; 