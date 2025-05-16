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
  getMyHotelBookings
} = require('../controllers/bookingController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();

// Middleware để kiểm tra dữ liệu đầu vào cho createBooking
const validateCreateBooking = [
  check('roomId').isMongoId().withMessage('ID phòng không hợp lệ'),
  check('checkIn').isISO8601().withMessage('Ngày check-in không hợp lệ'),
  check('checkOut').isISO8601().withMessage('Ngày check-out không hợp lệ'),
  check('bookingFor').isIn(['self', 'other']).withMessage('bookingFor phải là "self" hoặc "other"'),
  check('paymentMethod').isIn(['zalopay', 'vnpay', 'credit_card', 'paypal']).withMessage('Phương thức thanh toán không hợp lệ'),
  // Kiểm tra contactInfo khi bookingFor là 'other'
  check('contactInfo').custom((value, { req }) => {
    if (req.body.bookingFor === 'other') {
      if (!value.name || !value.email || !value.phone) {
        throw new Error('Thông tin liên hệ phải đầy đủ khi đặt phòng cho người khác');
      }
    }
    return true;
  }),
  // Kiểm tra guestInfo khi bookingFor là 'other'
  check('guestInfo').custom((value, { req }) => {
    if (req.body.bookingFor === 'other') {
      if (!value.name || !value.phone) {
        throw new Error('Thông tin người lưu trú phải bao gồm tên và số điện thoại');
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