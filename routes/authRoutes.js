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
router.get('/logout', protect, logout);

// Email verification
router.get('/verify-email/:token', verifyEmail);

// Password reset flow
router.post('/forgot-password', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', resetPassword);

module.exports = router;