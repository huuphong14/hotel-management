const express = require('express');
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  updateBookingStatus,
  checkVoucher,
  confirmPayment,
  checkPaymentStatus,
  zaloPayReturn,
  zaloPayCallback
} = require('../controllers/bookingController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();


router.post('/zalopay-callback', zaloPayCallback);
router.get('/zalopay-return', zaloPayReturn);

router.use(protect);

// User routes
router.post('/check-voucher', checkVoucher);
router.post('/', createBooking);
router.post('/confirm-payment', confirmPayment);
router.get('/my-bookings', getMyBookings);
router.patch('/:id/cancel', cancelBooking);

// Admin/Partner routes
router.patch(
  '/:id/status',
  authorize('admin', 'partner'),
  updateBookingStatus
);


router.get('/payment-status/:transactionId',checkPaymentStatus);

module.exports = router;