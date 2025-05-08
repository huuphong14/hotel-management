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

// Public routes for payment callbacks
router.post('/zalopay-callback', zaloPayCallback);
router.get('/zalopay-return', zaloPayReturn);
router.post('/vnpay-callback', vnPayCallback);
router.get('/vnpay-return', vnPayReturn);

router.use(protect);
router.get('/my-hotels', authorize('partner'), getMyHotelBookings);

// User routes
router.post('/check-voucher', checkVoucher);
router.post('/', createBooking);
router.post('/confirm-payment', confirmPayment);
router.get('/my-bookings', getMyBookings);
router.patch('/:id/cancel', cancelBooking);
router.get('/payment-status/:transactionId', checkPaymentStatus);
router.get('/vnpay-refund-status/:transactionId', checkVNPayRefundStatus);



// Trong router của bạn
router.get('/refund-status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    // Tìm giao dịch thanh toán
    const payment = await Payment.findOne({ transactionId });
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy giao dịch'
      });
    }
    
    // Kiểm tra trạng thái hoàn tiền
    if (!payment.refundTransactionId) {
      return res.json({
        success: false,
        message: 'Chưa có yêu cầu hoàn tiền cho giao dịch này',
        payment: {
          transactionId: payment.transactionId,
          status: payment.status
        }
      });
    }
    
    // Kiểm tra trạng thái trong database trước
    let statusResponse = {
      success: true,
      refund: {
        transactionId: payment.transactionId,
        refundTransactionId: payment.refundTransactionId,
        status: payment.status,
        refundAmount: payment.refundAmount || payment.amount,
        refundTimestamp: payment.refundTimestamp
      }
    };
    
    // Nếu đang xử lý hoàn tiền, kiểm tra lại với cổng thanh toán tương ứng
    if (payment.status === 'refunding') {
      if (payment.paymentMethod === 'zalopay') {
        // Kiểm tra với ZaloPay
        const timestamp = Date.now();
        const queryData = {
          app_id: ZaloPayService.config.appId,
          m_refund_id: payment.refundTransactionId,
          timestamp: timestamp
        };
        
        const dataStr = `${queryData.app_id}|${queryData.m_refund_id}|${queryData.timestamp}`;
        queryData.mac = crypto
          .createHmac('sha256', ZaloPayService.config.key1)
          .update(dataStr)
          .digest('hex');
        
        const response = await axios.post(`${ZaloPayService.config.endpoint}/query_refund`, null, {
          params: queryData,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        statusResponse.zaloPayResponse = {
          return_code: response.data.return_code,
          return_message: response.data.return_message,
          status: response.data.return_code === 1 ? 'completed' : 
                 response.data.return_code === 3 ? 'processing' : 'failed'
        };
      } else if (payment.paymentMethod === 'vnpay') {
        // Kiểm tra với VNPay
        const refundStatus = await VNPayService.checkRefundStatus(payment.refundTransactionId);
        statusResponse.vnPayResponse = refundStatus;
      }
    }
    
    return res.json(statusResponse);
    
  } catch (error) {
    console.error('Lỗi kiểm tra trạng thái hoàn tiền:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi kiểm tra trạng thái hoàn tiền'
    });
  }
});
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