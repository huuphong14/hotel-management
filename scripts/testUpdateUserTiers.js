require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');
const NotificationService = require('../services/notificationService');

// Kết nối database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Đã kết nối đến MongoDB');
  } catch (err) {
    console.error('Lỗi kết nối MongoDB:', err);
    process.exit(1);
  }
};

const debugUserTiers = async () => {
  try {
    await connectDB();
    
    // Access TIER_CONFIG từ User model
    // Note: Ensure TIER_CONFIG.calculationPeriod is set to 6 months in the User model
    const TIER_CONFIG = User.TIER_CONFIG;
    
    // Lấy tất cả user
    const users = await User.find({ role: 'user' }).select('+bookings');
    console.log(`Tổng số user: ${users.length}\n`);

    for (const user of users) {
      console.log(`\n=== DEBUG USER: ${user.name} (${user._id}) ===`);
      console.log(`Hạng hiện tại: ${user.tier}`);
      
      // Kiểm tra tất cả booking của user này
      const allBookings = await Booking.find({ user: user._id })
        .select('status paymentStatus finalPrice createdAt');
      console.log(`Tổng số booking: ${allBookings.length}`);
      
      if (allBookings.length > 0) {
        console.log('Chi tiết các booking:');
        allBookings.forEach((booking, index) => {
          console.log(`  ${index + 1}. Status: ${booking.status}, PaymentStatus: ${booking.paymentStatus}, FinalPrice: ${booking.finalPrice.toLocaleString('vi-VN')} VND, CreatedAt: ${booking.createdAt}`);
        });
      }
      
      // Kiểm tra booking trong khoảng thời gian cấu hình (6 tháng)
      const monthsAgo = new Date();
      monthsAgo.setMonth(monthsAgo.getMonth() - TIER_CONFIG.calculationPeriod);
      
      const recentBookings = await Booking.find({
        user: user._id,
        createdAt: { $gte: monthsAgo }
      }).select('status finalPrice createdAt');
      
      console.log(`Booking trong ${TIER_CONFIG.calculationPeriod} tháng gần nhất: ${recentBookings.length}`);
      
      // Kiểm tra booking completed
      const completedBookings = await Booking.find({
        user: user._id,
        status: 'completed',
        createdAt: { $gte: monthsAgo }
      }).select('finalPrice createdAt');
      
      console.log(`Booking completed trong ${TIER_CONFIG.calculationPeriod} tháng: ${completedBookings.length}`);
      
      if (completedBookings.length > 0) {
        const totalAmount = completedBookings.reduce((sum, booking) => sum + booking.finalPrice, 0);
        console.log(`Tổng tiền từ booking completed: ${totalAmount.toLocaleString('vi-VN')} VND`);
      }
      
      // Test hàm getTotalBookingAmount
      const calculatedTotal = await user.getTotalBookingAmount();
      console.log(`Kết quả từ getTotalBookingAmount(): ${calculatedTotal.toLocaleString('vi-VN')} VND`);
      
      // Test cập nhật tier
      const tierResult = await user.updateTier();
      console.log(`Kết quả cập nhật tier: ${tierResult.oldTier} -> ${tierResult.newTier}`);
      
      if (tierResult.oldTier !== tierResult.newTier) {
        const tierChangeType = tierResult.isDowngraded ? 'tier_downgrade' : 'tier_upgrade';
        const message = tierResult.isDowngraded
          ? `Hạng thành viên của bạn đã được điều chỉnh từ ${tierResult.oldTier} xuống ${tierResult.newTier} do tổng chi tiêu trong 6 tháng gần nhất không đạt yêu cầu. Tổng chi tiêu: ${tierResult.totalAmount.toLocaleString('vi-VN')} VND. Vui lòng kiểm tra chi tiết trong tài khoản của bạn.`
          : `Chúc mừng! Hạng thành viên của bạn đã được nâng từ ${tierResult.oldTier} lên ${tierResult.newTier} nhờ tổng chi tiêu ${tierResult.totalAmount.toLocaleString('vi-VN')} VND trong 6 tháng gần nhất. Hãy tiếp tục sử dụng dịch vụ để nhận thêm ưu đãi!`;

        // Gửi thông báo sử dụng NotificationService
        await NotificationService.createNotification({
          user: user._id,
          title: tierResult.isDowngraded ? 'Thông báo thay đổi hạng thành viên' : 'Chúc mừng nâng hạng thành viên',
          message,
          type: tierChangeType
        });

        console.log(`Trạng thái: ${tierResult.isDowngraded ? 'Giảm hạng' : 'Tăng hạng'}`);
        console.log(`Tổng chi tiêu: ${tierResult.totalAmount.toLocaleString('vi-VN')} VND`);
      } else {
        console.log('Không có thay đổi về hạng thành viên.');
      }
    }
    
  } catch (error) {
    console.error('Lỗi khi debug:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nĐã đóng kết nối database');
    process.exit(0);
  }
};

debugUserTiers();