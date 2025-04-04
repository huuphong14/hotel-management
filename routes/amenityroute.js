const express = require('express');
const router = express.Router();
const {
  createAmenity,
  getAmenities,
  getAmenity,
  updateAmenity,
  deleteAmenity
} = require('../controllers/amenityController');

const { protect } = require('../middlewares/auth');
const {authorize} = require('../middlewares/roleCheck')

router
  .route('/')
  .post(protect, authorize('admin'), createAmenity)
  .get(getAmenities);

router
  .route('/:id')
  .get(getAmenity)
  .put(protect, authorize('admin'), updateAmenity)
  .delete(protect, authorize('admin'), deleteAmenity);

module.exports = router;