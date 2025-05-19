const express = require('express');
const {
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
  addInteraction,
  getPostInteractions,
  deleteInteraction
} = require('../controllers/postController');
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

// Public routes
router.get('/', getPosts);
router.get('/:id', getPost);
router.get('/:id/interactions', getPostInteractions);

// Protected routes - Yêu cầu đăng nhập và vai trò partner hoặc admin
router.use(protect);
router.post('/', authorize('partner', 'admin'), upload.array('images', 10), createPost);
router.put('/:id', authorize('partner', 'admin'), upload.array('images', 10), updatePost);
router.delete('/:id', authorize('partner', 'admin'), deletePost);

// Interaction routes
router.post('/:id/interactions', addInteraction);
router.delete('/:postId/interactions/:interactionId', deleteInteraction);

module.exports = router;