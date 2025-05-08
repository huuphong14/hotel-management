const express = require('express');
const {
  createVoucher,
  getVouchers,
  getAvailableVouchers,
  updateVoucher,
} = require('../controllers/voucherController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');

const router = express.Router();

// Public routes
router.get('/available', protect, getAvailableVouchers);

// Admin routes
router.use(protect);
router.use(authorize('admin'));

router.route('/')
  .get(getVouchers)
  .post(createVoucher);

router.route('/:id')
  .put(updateVoucher);

module.exports = router;