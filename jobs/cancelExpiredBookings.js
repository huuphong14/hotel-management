const cron = require("node-cron");
const { cancelExpiredBookings } = require("../controllers/bookingController");

let isRunning = false;

cron.schedule("*/5 * * * *", async () => {
  if (isRunning) {
    console.log("Cron job đang chạy, bỏ qua lần này");
    return;
  }
  
  isRunning = true;
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] Bắt đầu cron job kiểm tra booking quá hạn...`);
    
    const result = await cancelExpiredBookings();
    
    const duration = Date.now() - startTime;
    console.log(`Cron job hoàn thành trong ${duration}ms`);
    console.log(`Kết quả: ${result.processedCount}/${result.totalFound} booking đã xử lý`);
    
    if (result.errors > 0) {
      console.warn(`Có ${result.errors} lỗi trong quá trình xử lý`);
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Cron job thất bại sau ${duration}ms:`);
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    
    // TODO: Có thể gửi alert tới admin ở đây
    
  } finally {
    isRunning = false;
  }
});

console.log(" Cron job hủy booking tự động đã được khởi tạo (mỗi 5 phút)");