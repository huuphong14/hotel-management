const Notification = require('../models/Notification');
const NotificationService = require('../services/notificationService');

// @desc    Lấy danh sách thông báo của user
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('relatedId');

    res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Đánh dấu thông báo đã đọc
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông báo'
      });
    }

    notification.status = 'read';
    await notification.save();

    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Đánh dấu tất cả thông báo đã đọc
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, status: 'unread' },
      { status: 'read' }
    );

    res.status(200).json({
      success: true,
      message: 'Đã đánh dấu tất cả thông báo là đã đọc'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Gửi thông báo admin
// @route   POST /api/notifications/admin
// @access  Admin
exports.sendAdminNotification = async (req, res) => {
  try {
    const { userIds, title, message } = req.body;

    const notifications = await NotificationService.createAdminNotification(
      userIds,
      title,
      message
    );

    res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
}; 