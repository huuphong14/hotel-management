const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {authorize} = require('../middlewares/roleCheck')
const {
  getRevenueStatistics,
  getBookingStatistics,
  getReviewStatistics,
  getUserStatistics,
  getRoomStatistics
} = require('../controllers/statisticsController');

// Thống kê doanh thu
router.get('/revenue', protect, authorize('admin', 'partner'), getRevenueStatistics);

// Thống kê đặt phòng
router.get('/bookings', protect, authorize('admin', 'partner'), getBookingStatistics);

// Thống kê đánh giá
router.get('/reviews', protect, authorize('admin', 'partner'), getReviewStatistics);

// Thống kê người dùng
router.get('/users', protect, authorize('admin'), getUserStatistics);

// Thống kê phòng
router.get('/rooms', protect, authorize('admin', 'partner'), getRoomStatistics);

module.exports = router;