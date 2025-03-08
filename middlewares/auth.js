const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');
const asyncHandler = require('./asyncHandler');

// Bảo vệ routes - yêu cầu đăng nhập
exports.protect = asyncHandler(async (req, res, next) => {
  let token;
  
  // Lấy token từ header hoặc cookie
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    // Lấy token từ header
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    // Lấy token từ cookie
    token = req.cookies.token;
  }
  
  // Kiểm tra xem token có tồn tại không
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Không có quyền truy cập. Vui lòng đăng nhập'
    });
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    
    // Lấy thông tin người dùng từ token
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy người dùng với ID này'
      });
    }
    
    // Kiểm tra xem tài khoản có bị khóa không
    if (user.accountLocked && user.accountLockedUntil > Date.now()) {
      return res.status(401).json({
        success: false,
        message: `Tài khoản của bạn tạm thời bị khóa. Vui lòng thử lại sau ${Math.ceil((user.accountLockedUntil - Date.now()) / 60000)} phút`
      });
    }
    
    // Đặt thông tin người dùng vào request
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ. Vui lòng đăng nhập lại'
    });
  }
});
