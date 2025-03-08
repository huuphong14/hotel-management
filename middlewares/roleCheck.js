exports.authorize = (...roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Không có quyền truy cập. Vui lòng đăng nhập'
        });
      }
      
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Role ${req.user.role} không có quyền thực hiện hành động này`
        });
      }
      
      next();
    };
  };
  