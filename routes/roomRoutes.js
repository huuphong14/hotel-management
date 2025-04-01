const express = require('express');
const { createRoom, getRooms, getRoom, updateRoom, deleteRoom, searchRooms } = require('../controllers/roomController');
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

// Public routes - Không cần đăng nhập
router.get('/search', searchRooms);
router.get('/hotels/:hotelId/rooms', getRooms);
router.get('/:id', getRoom); // Xem chi tiết một phòng


// Protected routes - Cần đăng nhập và phân quyền
router.use(protect);
router.post('/hotels/:hotelId/rooms', authorize('partner'), createRoom);
router.put('/:id', protect, authorize('partner'), upload.array('images', 10), updateRoom);
router.delete('/:id', authorize('partner'), deleteRoom);

module.exports = router;
