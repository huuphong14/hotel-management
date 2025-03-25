const Notification = require('../models/Notification');
const socketIO = require('../utils/socket');

class NotificationService {
  // Tạo thông báo đặt phòng
  static async createBookingNotification(booking) {
    try {
      const notification = await Notification.create({
        userId: booking.user,
        title: 'Đặt phòng thành công',
        message: `Bạn đã đặt phòng ${booking.room.name} thành công từ ${booking.checkIn} đến ${booking.checkOut}`,
        type: 'booking',
        relatedId: booking._id,
        refModel: 'Booking'
      });

      // Gửi thông báo realtime
      socketIO.sendNotification(booking.user, notification);

      return notification;
    } catch (error) {
      console.error('Create booking notification error:', error);
    }
  }

  // Tạo thông báo voucher mới
  static async createVoucherNotification(voucher, userIds) {
    try {
      const notifications = await Promise.all(
        userIds.map(userId =>
          Notification.create({
            userId,
            title: 'Voucher mới',
            message: `Mã giảm giá mới: ${voucher.code}. Giảm ${voucher.discount}đ cho đơn đặt phòng`,
            type: 'voucher',
            relatedId: voucher._id,
            refModel: 'Voucher'
          })
        )
      );

      // Sử dụng sendNotification
      notifications.forEach(notification => {
        socketIO.sendNotification(notification.userId, notification);
      });

      return notifications;
    } catch (error) {
      console.error('Create voucher notification error:', error);
      throw error;
    }
  }

  // Tạo thông báo từ admin
  static async createAdminNotification(userIds, title, message) {
    try {
      const notifications = await Promise.all(
        userIds.map(userId =>
          Notification.create({
            userId,
            title,
            message,
            type: 'admin'
          })
        )
      );

      // Gửi thông báo realtime
      notifications.forEach(notification => {
        socketIO.sendNotification(notification.userId, notification);
      });

      return notifications;
    } catch (error) {
      console.error('Create admin notification error:', error);
    }
  }

  // Tạo thông báo cập nhật trạng thái phòng
  static async createRoomStatusNotification(room, userIds) {
    try {
      const notifications = await Promise.all(
        userIds.map(userId =>
          Notification.create({
            userId,
            title: 'Cập nhật trạng thái phòng',
            message: `Phòng ${room.name} hiện ${room.status}`,
            type: 'room',
            relatedId: room._id,
            refModel: 'Room'
          })
        )
      );

      notifications.forEach(notification => {
        socketIO.sendNotification(notification.userId, notification);
      });

      return notifications;
    } catch (error) {
      console.error('Create room status notification error:', error);
    }
  }

  // Thông báo đăng ký đối tác mới cho admin
  static async createPartnerRegistrationNotification(partner, adminIds) {
    try {
      const notifications = await Promise.all(
        adminIds.map(adminId =>
          Notification.create({
            userId: adminId,
            title: 'Đăng ký đối tác mới',
            message: `${partner.name} đã đăng ký làm đối tác. Vui lòng xem xét và phê duyệt.`,
            type: 'partner',
            relatedId: partner._id,
            refModel: 'User'
          })
        )
      );

      notifications.forEach(notification => {
        socketIO.sendToUser(notification.userId, 'notification', notification);
      });

      return notifications;
    } catch (error) {
      console.error('Create partner registration notification error:', error);
    }
  }

  // Thông báo phê duyệt cho đối tác
  static async createPartnerApprovalNotification(partner) {
    try {
      const notification = await Notification.create({
        userId: partner._id,
        title: 'Tài khoản được phê duyệt',
        message: 'Tài khoản đối tác của bạn đã được phê duyệt. Bạn có thể bắt đầu sử dụng các tính năng dành cho đối tác.',
        type: 'partner'
      });

      socketIO.sendToUser(partner._id, 'notification', notification);
      return notification;
    } catch (error) {
      console.error('Create partner approval notification error:', error);
    }
  }

  // Thông báo từ chối cho đối tác
  static async createPartnerRejectionNotification(partner, reason) {
    try {
      const notification = await Notification.create({
        userId: partner._id,
        title: 'Tài khoản không được phê duyệt',
        message: `Tài khoản đối tác của bạn không được phê duyệt. Lý do: ${reason}`,
        type: 'partner'
      });

      socketIO.sendToUser(partner._id, 'notification', notification);
      return notification;
    } catch (error) {
      console.error('Create partner rejection notification error:', error);
    }
  }
}

module.exports = NotificationService; 