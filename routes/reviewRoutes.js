const express = require('express');
const {
  createReview,
  getHotelReviews,
  updateReview,
  respondToReview,
  deleteReview
} = require('../controllers/reviewController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');
const router = express.Router({ mergeParams: true });

router.route('/')
  .post(protect, createReview);
router.route('/:hotelId')
  .get( getHotelReviews);

router.route('/:id')
  .put(protect, updateReview)
  .delete(protect, deleteReview);

router.patch('/:id/response', protect, authorize('partner', 'admin'), respondToReview);

module.exports = router; 