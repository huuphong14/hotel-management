const express = require('express');
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  updateBookingStatus,
  checkVoucher
} = require('../controllers/bookingController');
const { protect} = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();

router.use(protect);

// User routes
router.post('/check-voucher', checkVoucher);
router.post('/', createBooking);
router.get('/my-bookings', getMyBookings);
router.patch('/:id/cancel', cancelBooking);

// Admin/Partner routes
router.patch(
  '/:id/status',
  authorize('admin', 'partner'),
  updateBookingStatus
);

module.exports = router; 