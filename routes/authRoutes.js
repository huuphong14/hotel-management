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
  facebookCallback,
  registerPartner,
  approvePartner,
  rejectPartner,
  getPendingPartners,
  refreshToken
} = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');
const passport = require('passport');

const router = express.Router();

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token',protect, refreshToken);
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
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  googleCallback
);

// Facebook OAuth routes
router.get('/facebook', facebookAuth);
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login', session: false }),
  facebookCallback
);

// Partner routes
router.post('/register-partner', registerPartner);

// Admin routes
router.use(protect);
router.use(authorize('admin'));
router.get('/pending-partners', getPendingPartners);
router.put('/approve-partner/:id', approvePartner);
router.put('/reject-partner/:id', rejectPartner);

module.exports = router;