const cron = require('node-cron');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');

// Hàm thực hiện cập nhật hạng người dùng
const updateUserTiers = async () => {
  console.log('Bắt đầu cập nhật hạng người dùng...');
  try {
    const users = await User.find({ role: 'user' });
    
    for (const user of users) {
      const oldTier = user.tier;
      const newTier = await user.updateTier();
      
      if (oldTier !== newTier) {
        // Gửi thông báo khi hạng thay đổi
        await NotificationService.createNotification({
          userId: user._id,
          type: 'tier_update',
          message: `Chúc mừng! Hạng của bạn đã được nâng lên thành ${newTier}.`
        });
      }
    }
    console.log('Cập nhật hạng người dùng hoàn tất.');
  } catch (error) {
    console.error('Lỗi khi cập nhật hạng người dùng:', error);
  }
};

// Lập lịch chạy mỗi ngày lúc 1:00 AM và chạy ngay lúc khởi động
const scheduleUserTierUpdate = async () => {
  // Chạy ngay lúc khởi động
  console.log('Khởi tạo: Chạy cập nhật hạng người dùng ngay lập tức...');
  await updateUserTiers();
  
  // Lập lịch chạy mỗi ngày lúc 1:00 AM
  cron.schedule('0 1 * * *', updateUserTiers, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh'
  });
  
  console.log('Đã lập lịch cập nhật hạng người dùng hàng ngày lúc 1:00 AM (GMT+7)');
};

module.exports = { scheduleUserTierUpdate };