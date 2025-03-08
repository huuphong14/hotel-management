const express = require('express');
const {
  createReview,
  getHotelReviews,
  updateReview,
  respondToReview,
  deleteReview
} = require('../controllers/reviewController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router({ mergeParams: true });

router.route('/')
  .get(getHotelReviews)
  .post(protect, createReview);

router.route('/:id')
  .put(protect, updateReview)
  .delete(protect, deleteReview);

router.put(
  '/:id/respond',
  protect,
  authorize('hotel_owner', 'admin'),
  respondToReview
);

module.exports = router; 