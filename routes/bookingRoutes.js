const express = require('express');
const { check, validationResult } = require('express-validator');
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  updateBookingStatus,
  confirmPayment,
  checkPaymentStatus,
  zaloPayReturn,
  zaloPayCallback,
  vnPayReturn,
  vnPayCallback,
  checkVNPayRefundStatus,
  getBookingDetails,
  getHotelBookings,
  getAllBookings,
  getMyHotelBookings,
  retryPayment
} = require('../controllers/bookingController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');
const Booking = require('../models/Booking');

const router = express.Router();

// Middleware để kiểm tra dữ liệu đầu vào cho createBooking
const validateCreateBooking = [
  check('roomId').isMongoId().withMessage('Invalid room ID'),
  check('checkIn').isISO8601().withMessage('Invalid check-in date'),
  check('checkOut').isISO8601().withMessage('Invalid check-out date'),
  check('bookingFor').isIn(['self', 'other']).withMessage('bookingFor must be "self" or "other"'),
  check('paymentMethod').isIn(['zalopay', 'vnpay', 'credit_card', 'paypal']).withMessage('Invalid payment method'),
  check('contactInfo').custom((value, { req }) => {
    if (req.body.bookingFor === 'other') {
      if (!value.name || !value.email || !value.phone) {
        throw new Error('Contact information must be complete when booking for someone else');
      }
    }
    return true;
  }),
  check('guestInfo').custom((value, { req }) => {
    if (req.body.bookingFor === 'other') {
      if (!value.name || !value.phone) {
        throw new Error('Guest information must include name and phone number');
      }
    }
    return true;
  }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

const validateRetryPayment = [
  check('bookingId').isMongoId().withMessage('Invalid booking ID'),
  check('paymentMethod').isIn(['zalopay', 'vnpay']).withMessage('Invalid payment method'),
  check('paymentMethod').custom((value, { req }) => {
    return Booking.findById(req.body.bookingId).then(booking => {
      if (booking && booking.paymentMethod && booking.paymentMethod !== value) {
        throw new Error('Payment method must match the original method');
      }
    });
  }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

// Public routes for payment callbacks
router.post('/zalopay-callback', zaloPayCallback);
router.get('/zalopay-return', zaloPayReturn);
router.post('/vnpay-callback', vnPayCallback);
router.get('/vnpay-return', vnPayReturn);

router.use(protect);
router.get('/my-hotels', authorize('partner'), getMyHotelBookings);

// User routes
router.post('/', validateCreateBooking, createBooking);
router.post('/confirm-payment', confirmPayment);
router.post('/retry-payment', validateRetryPayment, retryPayment);
router.get('/my-bookings', getMyBookings);
router.patch('/:id/cancel', cancelBooking);
router.get('/payment-status/:transactionId', checkPaymentStatus);
router.get('/vnpay-refund-status/:transactionId', checkVNPayRefundStatus);
router.get('/:id', getBookingDetails);

// Admin/Partner routes
router.patch(
  '/:id/status',
  authorize('admin', 'partner'),
  updateBookingStatus
);

router.get(
  '/hotel/:hotelId',
  authorize('admin', 'partner'),
  getHotelBookings
);

router.get(
  '/admin/all',
  authorize('admin'),
  getAllBookings
);

module.exports = router;