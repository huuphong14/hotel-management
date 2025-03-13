const express = require('express');
const {
  register,
  login,
  getMe,
  logout,
  verifyEmail,
  sendOTP,
  verifyOTP,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

// Email verification
router.get('/verify-email/:token', verifyEmail);

// Password reset flow
router.post('/password/forgot', sendOTP);
router.post('/password/verify-otp', verifyOTP);
router.post('/password/reset', resetPassword);

module.exports = router;