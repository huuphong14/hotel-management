const express = require('express');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  sendAdminNotification
} = require('../controllers/notificationController');
const { protect } = require('../middlewares/auth');
const { authorize} = require('../middlewares/roleCheck')

const router = express.Router();

router.use(protect);

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);

// Admin routes
router.post('/admin', authorize('admin'), sendAdminNotification);

module.exports = router; 