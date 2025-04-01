const express = require('express');
const {
  createHotel,
  getHotels,
  getHotel,
  updateHotel,
  deleteHotel,
  uploadHotelImages,
  getHotelImage,
  getFeaturedImage
} = require('../controllers/hotelController');
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
router.get('/', getHotels);
router.get('/:id', getHotel);
router.get('/:id/images/:imageIndex', getHotelImage); // Route để lấy ảnh từ array images
router.get('/:id/featured-image', getFeaturedImage); // Route để lấy ảnh đại diện

// Protected routes
router.use(protect);
router.post('/', authorize('partner'), upload.fields([
  { name: 'featuredImage', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]), createHotel);

router.put('/:id', authorize('partner'), upload.fields([
  { name: 'featuredImage', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]), updateHotel);

router.delete('/:id', authorize('partner'), deleteHotel);

// Route để upload ảnh riêng lẻ
router.post('/:id/images', authorize('partner'), upload.array('images', 10), uploadHotelImages);

module.exports = router;