const Notification = require('../models/Notification');
const socketIO = require('../utils/socket');

class NotificationService {
  // Tạo thông báo đặt phòng
  static async createBookingNotification(booking) {
    try {
      // Populate dữ liệu phòng để lấy thông tin chi tiết
      await booking.populate('room', 'name');

      const notification = await Notification.create({
        userId: booking.user,
        title: 'Xác nhận đặt phòng',
        message: `Đơn đặt phòng #${booking._id} từ ${new Date(booking.checkIn).toLocaleDateString('vi-VN')} đến ${new Date(booking.checkOut).toLocaleDateString('vi-VN')} đã được tạo thành công. Vui lòng thanh toán để xác nhận.`,
        type: 'booking',
        relatedId: booking._id,
        refModel: 'Booking'
      });

      // Gửi thông báo realtime
      socketIO.sendNotification(booking.user, notification);

      return notification;
    } catch (error) {
      console.error('Create booking notification error:', error);
      throw error; // Ném lỗi để xử lý ở tầng trên nếu cần
    }
  }

  // Tạo thông báo voucher mới
  static async createVoucherNotification(voucher, userIds) {
    try {
      const discountText = voucher.discountType === 'percentage' 
        ? `${voucher.discount}%` 
        : `${voucher.discount.toLocaleString('vi-VN')}đ`;

      const notifications = await Promise.all(
        userIds.map(userId =>
          Notification.create({
            userId,
            title: 'Ưu đãi mới dành cho bạn',
            message: `Mã giảm giá "${voucher.code}" vừa được cập nhật, giảm ${discountText} cho đơn đặt phòng. Hạn sử dụng: ${new Date(voucher.expiryDate).toLocaleDateString('vi-VN')}.`,
            type: 'voucher',
            relatedId: voucher._id,
            refModel: 'Voucher'
          })
        )
      );

      // Gửi thông báo realtime
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
            title: title || 'Thông báo từ hệ thống',
            message: message || 'Không có nội dung chi tiết.',
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
      throw error;
    }
  }

  // Tạo thông báo cập nhật trạng thái phòng
  static async createRoomStatusNotification(room, userIds) {
    try {
      const statusText = room.status === 'available' ? 'đã sẵn sàng' : 'không còn trống';
      const notifications = await Promise.all(
        userIds.map(userId =>
          Notification.create({
            userId,
            title: 'Cập nhật trạng thái phòng',
            message: `Phòng "${room.name}" hiện ${statusText}. Vui lòng kiểm tra để đặt phòng nếu cần.`,
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
      throw error;
    }
  }

  // Thông báo đăng ký đối tác mới cho admin
  static async createPartnerRegistrationNotification(partner, adminIds) {
    try {
      const notifications = await Promise.all(
        adminIds.map(adminId =>
          Notification.create({
            userId: adminId,
            title: 'Yêu cầu đăng ký đối tác mới',
            message: `Tài khoản "${partner.name}" vừa gửi yêu cầu trở thành đối tác. Vui lòng kiểm tra và phê duyệt trong hệ thống.`,
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
      throw error;
    }
  }

  // Thông báo phê duyệt cho đối tác
  static async createPartnerApprovalNotification(partner) {
    try {
      const notification = await Notification.create({
        userId: partner._id,
        title: 'Chúc mừng! Tài khoản đã được phê duyệt',
        message: `Tài khoản đối tác của bạn đã được phê duyệt thành công. Bạn có thể bắt đầu quản lý phòng và nhận đặt phòng ngay bây giờ.`,
        type: 'partner'
      });

      socketIO.sendToUser(partner._id, 'notification', notification);
      return notification;
    } catch (error) {
      console.error('Create partner approval notification error:', error);
      throw error;
    }
  }

  // Thông báo từ chối cho đối tác
  static async createPartnerRejectionNotification(partner, reason) {
    try {
      const notification = await Notification.create({
        userId: partner._id,
        title: 'Thông báo từ chối tài khoản đối tác',
        message: `Rất tiếc, yêu cầu trở thành đối tác của bạn đã bị từ chối. Lý do: ${reason}. Vui lòng liên hệ hỗ trợ nếu cần thêm thông tin.`,
        type: 'partner'
      });

      socketIO.sendToUser(partner._id, 'notification', notification);
      return notification;
    } catch (error) {
      console.error('Create partner rejection notification error:', error);
      throw error;
    }
  }

  // Tạo thông báo chung (dùng trong các trường hợp khác)
  static async createNotification({ user, title, message, type, relatedModel, relatedId }) {
    try {
      const notification = await Notification.create({
        userId: user,
        title,
        message,
        type,
        relatedId,
        refModel: relatedModel
      });

      socketIO.sendNotification(user, notification);
      return notification;
    } catch (error) {
      console.error('Create notification error:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;