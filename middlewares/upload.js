const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

// Cấu hình lưu trữ file
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // Xác định thư mục lưu trữ dựa trên loại upload
    let uploadPath = './public/uploads/';
    
    // Phân loại thư mục theo loại đối tượng
    if (req.baseUrl.includes('hotels')) {
      uploadPath += 'hotels/';
    } else if (req.baseUrl.includes('rooms')) {
      uploadPath += 'rooms/';
    } else if (req.baseUrl.includes('users')) {
      uploadPath += 'profiles/';
    } else {
      uploadPath += 'others/';
    }
    
    // Đảm bảo thư mục tồn tại
    const fs = require('fs');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    // Tạo tên file duy nhất bằng cách kết hợp timestamp và một chuỗi ngẫu nhiên
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    // Lấy phần mở rộng từ file gốc
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// Kiểm tra loại file
const fileFilter = (req, file, cb) => {
  // Chỉ chấp nhận các loại file ảnh
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  
  // Kiểm tra phần mở rộng
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  // Kiểm tra MIME type
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file hình ảnh (jpeg, jpg, png, gif, webp)'), false);
  }
};

// Cấu hình multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Giới hạn 5MB
    files: 10 // Giới hạn số lượng file
  }
});

// Middleware xử lý lỗi multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File quá lớn. Kích thước tối đa là 5MB'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Số lượng file vượt quá giới hạn'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Field không hợp lệ hoặc quá nhiều file'
      });
    }
  }
  
  if (err.message.includes('Chỉ chấp nhận file hình ảnh')) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next(err);
};

module.exports = {
  upload,
  handleMulterError
}; 