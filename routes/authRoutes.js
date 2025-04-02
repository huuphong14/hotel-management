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
const multer = require('multer');

const router = express.Router();

// Cấu hình multer cho việc xử lý file tạm thời
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Giới hạn 5MB
  },
  fileFilter: (req, file, cb) => {
    // Chỉ chấp nhận file ảnh
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file hình ảnh'), false);
    }
  }
});

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
router.post('/register-partner', 
  upload.fields([
    { name: 'featuredImage', maxCount: 1 },
    { name: 'hotelImages', maxCount: 10 }
  ]), 
  registerPartner
);

// Admin routes
router.use(protect);
router.use(authorize('admin'));
router.get('/pending-partners', getPendingPartners);
router.put('/approve-partner/:id', approvePartner);
router.put('/reject-partner/:id', rejectPartner);

module.exports = router;