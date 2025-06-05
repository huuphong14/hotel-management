const socketIO = require('socket.io');
const Chat = require('../models/Chat');
const Notification = require('../models/Notification');
const dialogflowController = require('../controllers/dialogflowController');

let io;
const userSockets = new Map(); // Lưu trữ socket của từng user

module.exports = {
  init: (server) => {
    io = socketIO(server);

    io.on('connection', (socket) => {
      // Lưu userId và socket khi user kết nối
      socket.on('join', (userId) => {
        socket.userId = userId;
        userSockets.set(userId, socket.id);
        socket.join(userId);

        // Thông báo user online
        socket.broadcast.emit('userOnline', { userId });
      });

      // CHAT HANDLERS
      socket.on('sendMessage', async (data) => {
        try {
          const { receiverId, message } = data;
          const senderId = socket.userId;

          const chat = await Chat.create({
            senderId,
            receiverId,
            message
          });

          await chat.populate('senderId', 'name');

          // Gửi tin nhắn đến người nhận
          if (userSockets.has(receiverId)) {
            io.to(receiverId).emit('newMessage', chat);

            // Tạo và gửi thông báo tin nhắn mới
            const notification = await Notification.create({
              userId: receiverId,
              title: 'Tin nhắn mới',
              message: `Bạn có tin nhắn mới từ ${chat.senderId.name}`,
              type: 'chat',
              relatedId: chat._id,
              refModel: 'Chat'
            });

            io.to(receiverId).emit('notification', notification);
          }

          socket.emit('messageSent', chat);
        } catch (error) {
          socket.emit('messageError', { message: 'Lỗi gửi tin nhắn' });
        }
      });

      socket.on('sendBotMessage', async (data) => {
        try {
          const { message, sessionId } = data;
          const userId = socket.userId;

          // Gửi tin nhắn đến Dialogflow
          const response = await dialogflowController.sendTextMessage(message, sessionId);

          // Gửi phản hồi từ Dialogflow về client 
          socket.emit('newBotMessage', {
            userMessage: message,
            botResponse: response.responseText,
            dialogflowResponse: response,
            sessionId,
          });
        } catch (error) {
          console.error('Bot message error:', error.message);
          socket.emit('botMessageError', { error: 'Lỗi xử lý với chatbot' });
        }
      });

      // NOTIFICATION HANDLERS
      socket.on('sendNotification', async (data) => {
        try {
          const { userIds, title, message, type, relatedId, refModel } = data;

          // Tạo và gửi thông báo cho nhiều user
          const notifications = await Promise.all(
            userIds.map(async (userId) => {
              const notification = await Notification.create({
                userId,
                title,
                message,
                type,
                relatedId,
                refModel
              });

              if (userSockets.has(userId)) {
                io.to(userId).emit('notification', notification);
              }

              return notification;
            })
          );

          socket.emit('notificationSent', { success: true, count: notifications.length });
        } catch (error) {
          socket.emit('notificationError', { message: 'Lỗi gửi thông báo' });
        }
      });

      // Đánh dấu thông báo đã đọc
      socket.on('markNotificationAsRead', async (data) => {
        try {
          const { notificationId } = data;

          const notification = await Notification.findByIdAndUpdate(
            notificationId,
            { status: 'read' },
            { new: true }
          );

          socket.emit('notificationRead', notification);
        } catch (error) {
          socket.emit('notificationError', { message: 'Lỗi cập nhật thông báo' });
        }
      });

      // COMMON HANDLERS
      socket.on('typing', (data) => {
        const { receiverId } = data;
        if (userSockets.has(receiverId)) {
          io.to(receiverId).emit('userTyping', { userId: socket.userId });
        }
      });

      socket.on('stopTyping', (data) => {
        const { receiverId } = data;
        if (userSockets.has(receiverId)) {
          io.to(receiverId).emit('userStopTyping', { userId: socket.userId });
        }
      });

      socket.on('markAsRead', async (data) => {
        try {
          const { chatId, senderId } = data;

          await Chat.findByIdAndUpdate(chatId, { status: 'read' });

          if (userSockets.has(senderId)) {
            io.to(senderId).emit('messageRead', { chatId });
          }
        } catch (error) {
          console.error('Mark as read error:', error);
        }
      });

      socket.on('disconnect', () => {
        if (socket.userId) {
          userSockets.delete(socket.userId);
          socket.leave(socket.userId);
          // Thông báo user offline
          socket.broadcast.emit('userOffline', { userId: socket.userId });
        }
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error('Socket.io not initialized!');
    }
    return io;
  },

  // Gửi event đến một user cụ thể
  sendToUser: (userId, event, data) => {
    if (userSockets.has(userId)) {
      io.to(userId).emit(event, data);
    }
  },

  // Gửi event đến nhiều user
  sendToUsers: (userIds, event, data) => {
    userIds.forEach(userId => {
      if (userSockets.has(userId)) {
        io.to(userId).emit(event, data);
      }
    });
  },

  // Gửi event đến tất cả user trừ sender
  broadcast: (senderId, event, data) => {
    io.sockets.emit(event, data);
  },

  sendNotification: (userId, notification) => {
    if (userSockets.has(userId)) {
      io.to(userId).emit('notification', notification);
    }
  }
}; 