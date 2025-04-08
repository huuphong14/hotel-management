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
    
    // Nếu đang xử lý hoàn tiền, kiểm tra lại với ZaloPay
    if (payment.status === 'refunding') {
      // Tương tự như code ở mục 2
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
module.exports = router;