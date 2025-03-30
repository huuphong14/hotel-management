const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');

router.get('/payment-status/:transactionId', bookingController.checkPaymentStatus);
router.post('/zalopay/webhook', bookingController.zaloPayWebhook);

module.exports = router;
