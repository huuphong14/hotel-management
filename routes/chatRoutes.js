const express = require('express');
const {
  sendMessage,
  getChatHistory,
  getConversations,
  markAsRead
} = require('../controllers/chatController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.use(protect); // Tất cả routes đều yêu cầu đăng nhập

router.post('/', sendMessage);
router.get('/conversations', getConversations);
router.get('/:userId', getChatHistory);
router.put('/:chatId/read', markAsRead);

module.exports = router; 