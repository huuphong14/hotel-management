const Chat = require('../models/Chat');
const User = require('../models/User');
const mongoose = require('mongoose');

// @desc    Gửi tin nhắn
// @route   POST /api/chats
// @access  Private
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user.id;

    // Kiểm tra người nhận tồn tại
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người nhận'
      });
    }

    const chat = await Chat.create({
      senderId,
      receiverId,
      message
    });

    res.status(201).json({
      success: true,
      data: chat
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy lịch sử chat với một người
// @route   GET /api/chats/:userId
// @access  Private
exports.getChatHistory = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    const chats = await Chat.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ]
    })
    .sort({ createdAt: 1 })
    .populate('senderId', 'name')
    .populate('receiverId', 'name');

    // Đánh dấu tin nhắn đã đọc
    await Chat.updateMany(
      {
        senderId: otherUserId,
        receiverId: currentUserId,
        status: 'unread'
      },
      { status: 'read' }
    );

    res.status(200).json({
      success: true,
      data: chats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách người đã chat
// @route   GET /api/chats/conversations
// @access  Private
exports.getConversations = async (req, res) => {
    try {
      const userId = req.user.id;
  
      // Kiểm tra userId hợp lệ
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ success: false, message: 'User ID không hợp lệ' });
      }
  
      const objectIdUserId = new mongoose.Types.ObjectId(userId);
  
      // Lấy danh sách người dùng đã chat với current user
      const conversations = await Chat.aggregate([
        {
          $match: {
            $or: [
              { senderId: objectIdUserId },
              { receiverId: objectIdUserId }
            ]
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ['$senderId', objectIdUserId] },
                '$receiverId',
                '$senderId'
              ]
            },
            lastMessage: { $first: '$message' },
            lastMessageDate: { $first: '$createdAt' },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$receiverId', objectIdUserId] },
                      { $eq: ['$status', 'unread'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $unwind: '$userInfo'
        },
        {
          $project: {
            _id: 1,
            name: '$userInfo.name',
            lastMessage: 1,
            lastMessageDate: 1,
            unreadCount: 1
          }
        }
      ]);
  
      res.status(200).json({
        success: true,
        data: conversations
      });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách cuộc trò chuyện:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  };

// @desc    Đánh dấu tin nhắn đã đọc
// @route   PUT /api/chats/:chatId/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tin nhắn'
      });
    }

    // Chỉ người nhận mới có thể đánh dấu đã đọc
    if (chat.receiverId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền thực hiện'
      });
    }

    chat.status = 'read';
    await chat.save();

    res.status(200).json({
      success: true,
      data: chat
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
}; 