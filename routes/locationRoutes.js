const express = require('express');
const router = express.Router();
const {
  createLocation,
  getLocations,
  getLocation,
  updateLocation,
  deleteLocation,
  getPopularLocations,
  searchLocations
} = require('../controllers/locationController');

// Middleware
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/roleCheck');
const multer = require('multer');


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
router.get('/', getLocations);
router.get('/search', searchLocations);
router.get('/popular', getPopularLocations);
router.get('/:id', getLocation);

// Private routes (Admin only)
router.post('/', protect, authorize('admin'), upload.single('image'), createLocation);
router.put('/:id', protect, authorize('admin'), upload.single('image'), updateLocation);
router.delete('/:id', protect, authorize('admin'), deleteLocation);

module.exports = router;