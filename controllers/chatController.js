const Chat = require("../models/Chat");
const User = require("../models/User");
const mongoose = require("mongoose");
const socketIO = require("../utils/socket");

/**
 * @swagger
 * /api/chats:
 *   post:
 *     summary: Gửi tin nhắn
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiverId
 *               - message
 *             properties:
 *               receiverId:
 *                 type: string
 *                 description: ID người nhận
 *               message:
 *                 type: string
 *                 description: Nội dung tin nhắn
 *     responses:
 *       201:
 *         description: Gửi tin nhắn thành công
 *       404:
 *         description: Không tìm thấy người nhận
 *       500:
 *         description: Lỗi server
 */
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user.id;

    // Kiểm tra người nhận tồn tại
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người nhận",
      });
    }

    const chat = await Chat.create({
      senderId,
      receiverId,
      message,
    });

    // Populate thông tin người gửi
    await chat.populate("senderId", "name");

    // Gửi tin nhắn realtime
    socketIO.sendToUser(receiverId, "newMessage", chat);

    res.status(201).json({
      success: true,
      data: chat,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/chats/{userId}:
 *   get:
 *     summary: Lấy lịch sử chat với một người
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID người dùng muốn lấy lịch sử chat
 *     responses:
 *       200:
 *         description: Lấy lịch sử chat thành công
 *       500:
 *         description: Lỗi server
 */
exports.getChatHistory = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    const chats = await Chat.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .populate("senderId", "name")
      .populate("receiverId", "name");

    // Đánh dấu tin nhắn đã đọc
    await Chat.updateMany(
      {
        senderId: otherUserId,
        receiverId: currentUserId,
        status: "unread",
      },
      { status: "read" }
    );

    res.status(200).json({
      success: true,
      data: chats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/chats/conversations:
 *   get:
 *     summary: Lấy danh sách người đã chat
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách cuộc trò chuyện thành công
 *       400:
 *         description: User ID không hợp lệ
 *       500:
 *         description: Lỗi server
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Kiểm tra userId hợp lệ
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "User ID không hợp lệ" });
    }

    const objectIdUserId = new mongoose.Types.ObjectId(userId);

    // Lấy danh sách người dùng đã chat với current user
    const conversations = await Chat.aggregate([
      {
        $match: {
          $or: [{ senderId: objectIdUserId }, { receiverId: objectIdUserId }],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$senderId", objectIdUserId] },
              "$receiverId",
              "$senderId",
            ],
          },
          lastMessage: { $first: "$message" },
          lastMessageDate: { $first: "$createdAt" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiverId", objectIdUserId] },
                    { $eq: ["$status", "unread"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $unwind: "$userInfo",
      },
      {
        $project: {
          _id: 1,
          name: "$userInfo.name",
          lastMessage: 1,
          lastMessageDate: 1,
          unreadCount: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách cuộc trò chuyện:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/chats/{chatId}/read:
 *   put:
 *     summary: Đánh dấu tin nhắn đã đọc
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID tin nhắn cần đánh dấu đã đọc
 *     responses:
 *       200:
 *         description: Đánh dấu tin nhắn đã đọc thành công
 *       403:
 *         description: Không có quyền thực hiện
 *       404:
 *         description: Không tìm thấy tin nhắn
 *       500:
 *         description: Lỗi server
 */
exports.markAsRead = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tin nhắn",
      });
    }

    // Chỉ người nhận mới có thể đánh dấu đã đọc
    if (chat.receiverId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền thực hiện",
      });
    }

    chat.status = "read";
    await chat.save();

    // Thông báo realtime cho người gửi
    socketIO.sendToUser(chat.senderId.toString(), "messageRead", {
      chatId: chat._id,
    });

    res.status(200).json({
      success: true,
      data: chat,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};
