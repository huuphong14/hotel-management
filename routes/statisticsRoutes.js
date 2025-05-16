const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');
const {
  getRevenueSummary,
  getRevenueChart,
  getTopRooms,
  getBookingStatistics
} = require('../controllers/statisticsController');

// Define routes with middleware
router.get('/summary', protect, authorize('partner'), getRevenueSummary);
router.get('/chart', protect, authorize('partner'), getRevenueChart);
router.get('/top-rooms', protect, authorize('partner'), getTopRooms);
router.get('/booking', protect, authorize('partner'), getBookingStatistics);

module.exports = router;