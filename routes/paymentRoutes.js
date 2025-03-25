const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');

// ZaloPay callback
router.post('/zalopay-callback', async (req, res) => {
  try {
    const result = await paymentService.handleZaloPayCallback(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router; 