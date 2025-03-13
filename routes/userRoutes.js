const express = require('express');
const {
  getMe,
  updateMe,
  uploadAvatar,
  changePassword,
  deactivateAccount,
  updateNotificationSettings,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getUserStats
} = require('../controllers/userController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');
const { upload, handleMulterError } = require('../middlewares/upload');

const router = express.Router();

// Tất cả routes yêu cầu đăng nhập
router.use(protect);

// User routes
router.get('/me', getMe);
router.put('/me', updateMe);
router.patch('/me/avatar', upload.single('avatar'), handleMulterError, uploadAvatar);
router.patch('/me/settings/password', changePassword);
router.patch('/me/settings/notifications', updateNotificationSettings);
router.delete('/me', deactivateAccount);

// Admin routes
router.use(authorize('admin'));
router.get('/', getUsers);
router.get('/stats', getUserStats);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;