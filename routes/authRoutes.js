const express = require('express');
const {
  register,
  login,
  getMe,
  logout,
  verifyEmail,
  sendOTP,
  verifyOTP,
  resetPassword,
  googleAuth,
  googleCallback,
  facebookAuth,
  facebookCallback
} = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const passport = require('passport');

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

// Google OAuth routes
router.get('/google', googleAuth);
router.get('/google/callback', passport.authenticate('google'), googleCallback);

// Facebook OAuth routes  
router.get('/facebook', facebookAuth);
router.get('/facebook/callback', passport.authenticate('facebook'), facebookCallback);

module.exports = router;