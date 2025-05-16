const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {authorize} = require('../middlewares/roleCheck')
const {
  getSystemOverview,
  getBookingStatus,
  getHotelStatus,
  getChartData,
  getTopHotelsByBookings,
  getTopUsersByBookings
} = require('../controllers/adminStatisticsController');

// Định nghĩa các route với middleware
router.get('/system-overview', protect, authorize('admin'), getSystemOverview);
router.get('/booking-status', protect, authorize('admin'), getBookingStatus);
router.get('/hotel-status', protect, authorize('admin'), getHotelStatus);
router.get('/chart-data', protect, authorize('admin'), getChartData);
router.get('/top-hotels', protect, authorize('admin'), getTopHotelsByBookings);
router.get('/top-users', protect, authorize('admin'), getTopUsersByBookings);

module.exports = router;