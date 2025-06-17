const cron = require('node-cron');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');

// Access TIER_CONFIG từ User model
const { TIER_CONFIG } = User;

// Hàm thực hiện cập nhật hạng người dùng
const updateUserTiers = async () => {
  console.log('Bắt đầu cập nhật hạng người dùng...');
  try {
    const users = await User.find({ role: 'user' });
    let stats = {
      upgraded: 0,
      downgraded: 0,
      unchanged: 0
    };
    
    for (const user of users) {
      const result = await user.updateTier();
      
      if (result.oldTier !== result.newTier) {
        if (result.isDowngraded) {
          // Thông báo hạng giảm
          await NotificationService.createNotification({
            userId: user._id,
            type: 'tier_downgrade',
            message: `Hạng của bạn đã được điều chỉnh xuống ${result.newTier} do không đạt yêu cầu chi tiêu trong ${TIER_CONFIG.calculationPeriod} tháng gần nhất.`
          });
          stats.downgraded++;
        } else {
          // Thông báo hạng tăng
          await NotificationService.createNotification({
            userId: user._id,
            type: 'tier_upgrade',
            message: `Chúc mừng! Hạng của bạn đã được nâng lên thành ${result.newTier} nhờ tổng chi tiêu ${result.totalAmount.toLocaleString('vi-VN')} VND trong ${TIER_CONFIG.calculationPeriod} tháng gần nhất.`
          });
          stats.upgraded++;
        }
      } else {
        stats.unchanged++;
      }
    }
    
    console.log('Cập nhật hạng người dùng hoàn tất:', stats);
  } catch (error) {
    console.error('Lỗi khi cập nhật hạng người dùng:', error);
  }
};

// Lập lịch chạy mỗi ngày lúc 1:00 AM
const scheduleUserTierUpdate = () => {
  // Lập lịch chạy mỗi ngày lúc 1:00 AM
  cron.schedule('0 1 * * *', updateUserTiers, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh'
  });
  
  console.log('Đã lập lịch cập nhật hạng người dùng hàng ngày lúc 1:00 AM (GMT+7)');
};

// Export các hàm cần thiết
module.exports = { 
  scheduleUserTierUpdate,
  updateUserTiers
};