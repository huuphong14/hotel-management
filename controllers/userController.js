const User = require('../models/User');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const asyncHandler = require('../middlewares/asyncHandler');
const sendEmail = require('../utils/sendEmail');
const fs = require('fs');
const path = require('path');
const cloudinaryService = require('../config/cloudinaryService');

// @desc    Lấy thông tin người dùng hiện tại
// @route   GET /api/users/me
// @access  Private
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Cập nhật thông tin người dùng
// @route   PUT /api/users/me
// @access  Private
exports.updateMe = asyncHandler(async (req, res) => {
  // Lọc các trường được phép cập nhật
  const fieldsToUpdate = {};
  const allowedFields = ['name', 'email', 'phone', 'address', 'preferences'];
  
  // Chỉ lấy các trường được phép
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      // Với trường address và preferences, cập nhật từng trường con
      if (key === 'address' || key === 'preferences') {
        fieldsToUpdate[key] = { ...req.user[key], ...req.body[key] };
      } else {
        fieldsToUpdate[key] = req.body[key];
      }
    }
  });
  
  // Nếu email thay đổi, đặt isEmailVerified thành false và yêu cầu xác thực lại
  if (fieldsToUpdate.email && fieldsToUpdate.email !== req.user.email) {
    fieldsToUpdate.isEmailVerified = false;
    
    // Tạo token xác thực email mới
    const user = await User.findById(req.user.id);
    const verificationToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });
    
    // Gửi email xác thực
    const verificationUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${verificationToken}`;
    const message = `Vui lòng xác thực email mới của bạn bằng cách click vào link sau: ${verificationUrl}`;
    
    try {
      await sendEmail({
        email: fieldsToUpdate.email,
        subject: 'Xác thực email mới',
        message
      });
    } catch (err) {
      user.emailVerificationToken = undefined;
      user.emailVerificationExpire = undefined;
      await user.save({ validateBeforeSave: false });
      
      return res.status(500).json({
        success: false,
        message: 'Không thể gửi email xác thực. Vui lòng thử lại sau'
      });
    }
  }
  
  // Cập nhật thông tin người dùng
  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true
  });
  
  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Upload avatar
// @route   PATCH /api/users/me/avatar
// @access  Private
exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng tải lên một ảnh'
    });
  }
  
  // Lấy thông tin người dùng
  const user = await User.findById(req.user.id);
  
  try {
    // Upload avatar mới lên Cloudinary trong folder users
    const uploadResult = await cloudinaryService.uploadFromBuffer(req.file, 'users');
    
    // Xóa avatar cũ trên Cloudinary nếu có
    if (user.avatar && user.avatar.length > 0) {
      // Lấy danh sách publicId để xóa
      const publicIdsToDelete = user.avatar.map(img => img.publicId);
      await cloudinaryService.deleteMany(publicIdsToDelete);
    }
    
    // Cập nhật avatar mới trong DB
    user.avatar = [{
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      filename: uploadResult.filename
    }];
    
    await user.save();
    
    res.status(200).json({
      success: true,
      data: {
        avatar: user.avatar
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể tải lên avatar. Vui lòng thử lại sau',
      error: error.message
    });
  }
});

// @desc    Đổi mật khẩu
// @route   PATCH /api/users/me/change-password
// @access  Private
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword, logoutAllDevices } = req.body;
  
  // Kiểm tra các trường
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp đầy đủ thông tin'
    });
  }
  
  // Kiểm tra mật khẩu mới và xác nhận mật khẩu
  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Mật khẩu xác nhận không khớp'
    });
  }
  
  // Kiểm tra độ dài mật khẩu mới
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
    });
  }
  
  // Kiểm tra mật khẩu mới khác mật khẩu cũ
  if (newPassword === currentPassword) {
    return res.status(400).json({
      success: false,
      message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại'
    });
  }
  
  // Lấy thông tin người dùng (bao gồm password và refreshToken)
  const user = await User.findById(req.user.id).select('+password +refreshToken');
  
  // Kiểm tra nếu không tìm thấy người dùng
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy người dùng'
    });
  }
  
  // Kiểm tra mật khẩu hiện tại
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Mật khẩu hiện tại không đúng'
    });
  }
  
  // Cập nhật mật khẩu mới
  user.password = newPassword;
  
  // Nếu người dùng muốn đăng xuất khỏi tất cả các thiết bị khác
  if (logoutAllDevices) {
    user.refreshToken = undefined;
  }
  
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Đổi mật khẩu thành công',
    loggedOutAllDevices: !!logoutAllDevices
  });
});

// @desc    Vô hiệu hóa tài khoản (soft delete)
// @route   PATCH /api/users/me/deactivate
// @access  Private
exports.deactivateAccount = asyncHandler(async (req, res) => {
  // Kiểm tra mật khẩu
  const { password, reason } = req.body;
  
  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập mật khẩu để xác nhận'
    });
  }
  
  // Lấy thông tin người dùng (bao gồm password)
  const user = await User.findById(req.user.id).select('+password');
  
  // Kiểm tra mật khẩu
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Mật khẩu không đúng'
    });
  }
  
  // Kiểm tra xem người dùng có phải là chủ khách sạn (partner)
  if (user.role === 'partner') {
    const hotels = await Hotel.find({ ownerId: user._id });
    if (hotels.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Không thể vô hiệu hóa tài khoản khi bạn vẫn còn khách sạn. Vui lòng xóa hoặc chuyển quyền sở hữu khách sạn trước'
      });
    }
  }
  
  // Kiểm tra xem người dùng có booking đang hoạt động không
  const activeBookings = await Booking.find({
    userId: user._id,
    status: { $in: ['pending', 'confirmed', 'checked_in'] }
  });
  
  if (activeBookings.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Không thể vô hiệu hóa tài khoản khi bạn vẫn còn đặt phòng đang hoạt động. Vui lòng hủy hoặc hoàn thành các đặt phòng trước'
    });
  }
  
  // Vô hiệu hóa tài khoản (cập nhật trạng thái)
  user.status = 'rejected';
  await user.save({ validateBeforeSave: false });
  
  // Gửi mail thông báo
  try {
    await sendEmail({
      email: user.email,
      subject: 'Tài khoản đã bị vô hiệu hóa',
      message: `Tài khoản của bạn đã bị vô hiệu hóa theo yêu cầu. Nếu đây là một sự nhầm lẫn hoặc bạn muốn kích hoạt lại tài khoản, vui lòng liên hệ với chúng tôi.`
    });
  } catch (err) {
    console.error('Không thể gửi email thông báo vô hiệu hóa tài khoản', err);
  }
  
  // Xóa token
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.status(200).json({
    success: true,
    message: 'Tài khoản đã bị vô hiệu hóa',
    data: {
      userId: user._id,
      status: user.status,
      deactivationReason: user.deactivationReason,
      deactivatedAt: user.deactivatedAt
    }
  });
});

// @desc    Cập nhật thiết lập thông báo
// @route   PUT /api/users/me/notifications
// @access  Private
exports.updateNotificationSettings = asyncHandler(async (req, res) => {
  const { email, promotions, bookingUpdates } = req.body;
  
  // Cập nhật thiết lập thông báo
  const fieldsToUpdate = {
    'preferences.notifications': {}
  };
  
  if (email !== undefined) fieldsToUpdate['preferences.notifications'].email = email;
  if (promotions !== undefined) fieldsToUpdate['preferences.notifications'].promotions = promotions;
  if (bookingUpdates !== undefined) fieldsToUpdate['preferences.notifications'].bookingUpdates = bookingUpdates;
  
  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true
  });
  
  res.status(200).json({
    success: true,
    data: user.preferences.notifications
  });
});

// @desc    Lấy danh sách tất cả người dùng (admin only)
// @route   GET /api/users
// @access  Private (Admin)
exports.getUsers = asyncHandler(async (req, res) => {
  // Tìm kiếm và lọc
  let query = {};
  
  // Tìm kiếm theo tên hoặc email
  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } }
    ];
  }
  
  // Lọc theo role
  if (req.query.role) {
    query.role = req.query.role;
  }
  
  // Lọc theo trạng thái xác thực email
  if (req.query.isEmailVerified) {
    query.isEmailVerified = req.query.isEmailVerified === 'true';
  }
  
  // Phân trang
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  const total = await User.countDocuments(query);
  
  // Truy vấn với sắp xếp
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
  
  const users = await User.find(query)
    .sort({ [sortBy]: sortOrder })
    .skip(startIndex)
    .limit(limit)
    .select('-emailVerificationToken -emailVerificationExpire -resetPasswordToken -resetPasswordExpire -otpToken -otpExpire');
  
  // Thông tin phân trang
  const pagination = {
    totalItems: total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    pageSize: limit
  };
  
  if (startIndex > 0) {
    pagination.previousPage = page - 1;
  }
  
  if (startIndex + limit < total) {
    pagination.nextPage = page + 1;
  }
  
  res.status(200).json({
    success: true,
    count: users.length,
    pagination,
    data: users
  });
});

// @desc    Lấy thông tin một người dùng (admin only)
// @route   GET /api/users/:id
// @access  Private (Admin)
exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-emailVerificationToken -emailVerificationExpire -resetPasswordToken -resetPasswordExpire -otpToken -otpExpire');
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy người dùng'
    });
  }
  
  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Cập nhật thông tin người dùng (admin only)
// @route   PUT /api/users/:id
// @access  Private (Admin)
exports.updateUser = asyncHandler(async (req, res) => {
  // Lọc các trường được phép cập nhật
  const fieldsToUpdate = {};
  const allowedFields = ['name', 'email', 'phone', 'role', 'isEmailVerified', 'address',];
  
  // Chỉ lấy các trường được phép
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      if (key === 'address' || key === 'preferences') {
        const user = User.findById(req.params.id);
        fieldsToUpdate[key] = { ...(user[key] || {}), ...req.body[key] };
      } else {
        fieldsToUpdate[key] = req.body[key];
      }
    }
  });
  
  // Cập nhật thông tin người dùng
  const user = await User.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
    new: true,
    runValidators: true
  });
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy người dùng'
    });
  }
  
  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Xóa người dùng (admin only)
// @route   DELETE /api/users/:id
// @access  Private (Admin)
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy người dùng'
    });
  }
  
  // Kiểm tra xem có phải admin cuối cùng không
  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa admin cuối cùng'
      });
    }
  }
  
  // Kiểm tra xem người dùng có phải là chủ khách sạn
  if (user.role === 'hotel_owner') {
    const hotels = await Hotel.find({ ownerId: user._id });
    if (hotels.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa người dùng khi họ vẫn còn khách sạn. Vui lòng xóa hoặc chuyển quyền sở hữu khách sạn trước'
      });
    }
  }
  
  // Kiểm tra xem người dùng có booking đang hoạt động không
  const activeBookings = await Booking.find({
    userId: user._id,
    status: { $in: ['pending', 'confirmed', 'checked_in'] }
  });
  
  if (activeBookings.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Không thể xóa người dùng khi họ vẫn còn đặt phòng đang hoạt động'
    });
  }
  
  // Xóa avatar nếu không phải avatar mặc định
  if (user.avatar !== 'default-avatar.jpg') {
    const avatarPath = path.join(__dirname, '../public/uploads/profiles/', user.avatar);
    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }
  }
  
  // Xóa người dùng
  await user.remove();
  
  res.status(200).json({
    success: true,
    message: 'Đã xóa người dùng'
  });
});
// @desc    Vô hiệu hóa tài khoản người dùng bởi Admin
// @route   PATCH /api/users/:id/deactivate
// @access  Private (Admin)
exports.deactivateUserByAdmin = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  if (!reason) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp lý do vô hiệu hóa tài khoản'
    });
  }

  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy người dùng'
    });
  }
  
  // Kiểm tra nếu tài khoản đã bị vô hiệu hóa
  if (user.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: `Tài khoản này đã ${user.status === 'pending' ? 'đang chờ xác minh' : 'bị vô hiệu hóa'}`
    });
  }
  
  // Kiểm tra nếu là admin cuối cùng
  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin', status: 'active' });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Không thể vô hiệu hóa admin cuối cùng'
      });
    }
  }
  
  // Kiểm tra xem người dùng có phải là chủ khách sạn
  if (user.role === 'partner') {
    const hotels = await Hotel.find({ ownerId: user._id });
    if (hotels.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Không thể vô hiệu hóa tài khoản khi người dùng vẫn còn khách sạn. Vui lòng xóa hoặc chuyển quyền sở hữu khách sạn trước'
      });
    }
  }
  
  // Kiểm tra xem người dùng có booking đang hoạt động không
  const activeBookings = await Booking.find({
    userId: user._id,
    status: { $in: ['pending', 'confirmed', 'checked_in'] }
  });
  
  if (activeBookings.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Không thể vô hiệu hóa tài khoản khi người dùng vẫn còn đặt phòng đang hoạt động'
    });
  }
  
  // Lưu thông tin vô hiệu hóa
  user.status = 'rejected';
  user.deactivationReason = reason;
  user.deactivatedAt = Date.now();
  await user.save({ validateBeforeSave: false });
  
  // Gửi email thông báo
  try {
    await sendEmail({
      email: user.email,
      subject: 'Tài khoản của bạn đã bị vô hiệu hóa',
      message: `Tài khoản của bạn đã bị vô hiệu hóa vì lý do: ${reason}. Nếu bạn cho rằng đây là sự nhầm lẫn hoặc muốn kích hoạt lại tài khoản, vui lòng liên hệ với chúng tôi.`
    });
  } catch (err) {
    console.error('Không thể gửi email thông báo vô hiệu hóa tài khoản', err);
  }
  
  res.status(200).json({
    success: true,
    message: 'Đã vô hiệu hóa tài khoản người dùng',
    data: {
      userId: user._id,
      status: user.status,
      deactivationReason: user.deactivationReason,
      deactivatedAt: user.deactivatedAt
    }
  });
});

// @desc    Kích hoạt lại tài khoản người dùng (admin only)
// @route   PATCH /api/users/:id/activate
// @access  Private (Admin)
exports.activateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy người dùng'
    });
  }
  
  // Kiểm tra nếu tài khoản đã được kích hoạt
  if (user.status === 'active') {
    return res.status(400).json({
      success: false,
      message: 'Tài khoản này đã được kích hoạt'
    });
  }
  
  // Kích hoạt lại tài khoản
  user.status = 'active';
  user.deactivationReason = undefined;
  user.deactivatedAt = undefined;
  await user.save({ validateBeforeSave: false });
  
  // Gửi email thông báo
  try {
    await sendEmail({
      email: user.email,
      subject: 'Tài khoản của bạn đã được kích hoạt lại',
      message: 'Tài khoản của bạn đã được kích hoạt lại và bạn có thể đăng nhập vào hệ thống.'
    });
  } catch (err) {
    console.error('Không thể gửi email thông báo kích hoạt lại tài khoản', err);
  }
  
  res.status(200).json({
    success: true,
    message: 'Đã kích hoạt lại tài khoản người dùng',
    data: {
      userId: user._id,
      status: user.status
    }
  });
});

// @desc    Lấy thống kê người dùng (admin only)
// @route   GET /api/users/stats
// @access  Private (Admin)
exports.getUserStatus = asyncHandler(async (req, res) => {
  // Thống kê theo role
  const roleStats = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);
  
  // Thống kê người dùng mới theo tháng (6 tháng gần nhất)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const newUserStats = await User.aggregate([
    { 
      $match: { 
        createdAt: { $gte: sixMonthsAgo }
      } 
    },
    {
      $group: {
        _id: { 
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
  
  // Thống kê theo trạng thái xác thực email
  const emailVerificationStats = await User.aggregate([
    { $group: { _id: '$isEmailVerified', count: { $sum: 1 } } }
  ]);
  
  // Thống kê người dùng đã vô hiệu hóa
  const inactiveUserCount = await User.countDocuments({ active: false });
  
  res.status(200).json({
    success: true,
    data: {
      total: await User.countDocuments(),
      roles: roleStats.reduce((obj, item) => {
        obj[item._id || 'undefined'] = item.count;
        return obj;
      }, {}),
      emailVerification: emailVerificationStats.reduce((obj, item) => {
        obj[item._id ? 'verified' : 'unverified'] = item.count;
        return obj;
      }, {}),
      inactive: inactiveUserCount,
      newUsers: newUserStats.map(item => ({
        year: item._id.year,
        month: item._id.month,
        count: item.count
      }))
    }
  });
});