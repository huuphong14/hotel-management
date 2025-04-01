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

// Tất cả routes yêu cầu đăng nhập
router.use(protect);

// User routes
router.get('/me', getMe);
router.put('/me', updateMe);
router.patch('/me/avatar', upload.single('avatar'), uploadAvatar);
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