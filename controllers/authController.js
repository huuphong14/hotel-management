const User = require('../models/User');
const Hotel = require('../models/Hotel');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendTokenResponse } = require('../utils/tokenUtils');
const sendEmail = require('../utils/sendEmail');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const passport = require('passport');
const asyncHandler = require('../middlewares/asyncHandler');

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @desc    Đăng ký tài khoản
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin",
      });
    }      

    // Kiểm tra email đã tồn tại
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'Email đã được đăng ký'
      });
    }

    // Tạo user mới với role mặc định là 'user'
    user = await User.create({
      name,
      email,
      password,
      role: 'user'
    });

    // Tạo token xác thực email
    const verificationToken = user.getVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Tạo URL xác thực
    const verificationUrl = `${config.clientUrl}/verify-email/${verificationToken}`;

    // Nội dung email
    const message = `
      <h1>Xác nhận đăng ký tài khoản</h1>
      <p>Cảm ơn bạn đã đăng ký tài khoản tại hệ thống của chúng tôi.</p>
      <p>Vui lòng nhấn vào đường dẫn sau để xác nhận email của bạn:</p>
      <a href="${verificationUrl}" target="_blank">Xác nhận email</a>
      <p>Đường dẫn có hiệu lực trong 24 giờ.</p>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Xác nhận đăng ký tài khoản',
        message
      });

      res.status(200).json({
        success: true,
        message: 'Email xác nhận đã được gửi'
      });
    } catch (error) {
      user.verificationToken = undefined;
      user.verificationTokenExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Không thể gửi email xác nhận'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Xác thực email
// @route   GET /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const verificationToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      verificationToken,
      verificationTokenExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token không hợp lệ hoặc đã hết hạn'
      });
    }

    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Xác thực email thành công'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Đăng nhập
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập email và mật khẩu'
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Thông tin đăng nhập không chính xác'
      });
    }

    if (!user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng xác thực email trước khi đăng nhập'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Thông tin đăng nhập không chính xác'
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};


// @desc    Lấy thông tin người dùng
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Đăng xuất
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = undefined;
      await user.save({ validateBeforeSave: false });
    }

    res.cookie('token', 'none', { 
      expires: new Date(Date.now() + 10 * 1000), 
      httpOnly: true 
    });
    
    res.cookie('refreshToken', 'none', { 
      expires: new Date(Date.now() + 10 * 1000), 
      httpOnly: true 
    });

    res.status(200).json({ 
      success: true, 
      message: 'Đăng xuất thành công' 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Refresh Token
// @route   POST /api/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Không có refresh token' });
    }

    const user = await User.findOne({ refreshToken });

    if (!user) {
      return res.status(403).json({ success: false, message: 'Refresh token không hợp lệ' });
    }

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ success: false, message: 'Refresh token hết hạn hoặc không hợp lệ' });
      }

      const newAccessToken = user.getAccessToken();
      res.status(200).json({ success: true, accessToken: newAccessToken });
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};


// @desc    Gửi mã OTP để đặt lại mật khẩu
// @route   POST /api/auth/password/forgot
// @access  Public
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống' });
    }

    const otp = generateOTP();
    user.resetPasswordToken = crypto.createHash('sha256').update(otp).digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 phút
    await user.save({ validateBeforeSave: false });

    const message = `<h1>Mã OTP: ${otp}</h1>`;
    await sendEmail({ email: user.email, subject: 'Mã OTP', message });

    res.status(200).json({ success: true, message: 'Mã OTP đã được gửi' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// @desc    Xác thực mã OTP
// @route   POST /api/auth/password/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordToken || !user.resetPasswordExpire) {
      return res.status(400).json({ success: false, message: 'OTP không hợp lệ hoặc đã hết hạn' });
    }
    
    const hashedOTP = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (hashedOTP !== user.resetPasswordToken || user.resetPasswordExpire < Date.now()) {
      return res.status(400).json({ success: false, message: 'Mã OTP không hợp lệ hoặc đã hết hạn' });
    }

    res.status(200).json({ success: true, message: 'Xác thực OTP thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// @desc    Đặt lại mật khẩu
// @route   POST /api/auth/password/reset
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp email, OTP và mật khẩu mới'
      });
    }

    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(String(otp).trim())
      .digest('hex');

    const user = await User.findOne({
      email,
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Mã OTP không hợp lệ hoặc đã hết hạn'
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Đặt lại mật khẩu thành công'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Đăng nhập bằng Google
// @route   GET /api/auth/google
// @access  Public
exports.googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email']
});

// @desc    Callback sau khi đăng nhập Google
// @route   GET /api/auth/google/callback
// @access  Public
exports.googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Xác thực Google thất bại',
      });
    }

    const { email, displayName } = req.user;

    let existingUser = await User.findOne({ email });
    if (!existingUser) {
      // Tạo user mới nếu chưa tồn tại
      existingUser = await User.create({
        name: displayName,
        email,
        password: crypto.randomBytes(20).toString('hex'), // Mật khẩu ngẫu nhiên
        isEmailVerified: true,
        provider: 'google',
      });
    } else if (existingUser.provider !== 'google') {
      return res.status(400).json({
        success: false,
        message: 'Email đã được đăng ký bằng phương thức khác',
      });
    }

    // Kiểm tra trạng thái tài khoản
    if (existingUser.status === 'rejected' || existingUser.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản chưa được kích hoạt hoặc bị từ chối',
      });
    }

    sendTokenResponse(existingUser, 200, res);
  } catch (error) {
    console.error('Lỗi Google Callback:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
    });
  }
};

// @desc    Đăng nhập bằng Facebook
// @route   GET /api/auth/facebook
// @access  Public
exports.facebookAuth = passport.authenticate('facebook', {
  scope: ['email']
});

// @desc    Callback sau khi đăng nhập Facebook
// @route   GET /api/auth/facebook/callback
// @access  Public
exports.facebookCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Xác thực Facebook thất bại',
      });
    }

    const { email, displayName } = req.user;

    let existingUser = await User.findOne({ email });
    if (!existingUser) {
      existingUser = await User.create({
        name: displayName,
        email,
        password: crypto.randomBytes(20).toString('hex'),
        isEmailVerified: true,
        provider: 'facebook',
      });
    } else if (existingUser.provider !== 'facebook') {
      return res.status(400).json({
        success: false,
        message: 'Email đã được đăng ký bằng phương thức khác',
      });
    }

    // Kiểm tra trạng thái tài khoản
    if (existingUser.status === 'rejected' || existingUser.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản chưa được kích hoạt hoặc bị từ chối',
      });
    }

    sendTokenResponse(existingUser, 200, res);
  } catch (error) {
    console.error('Lỗi Facebook Callback:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
    });
  }
};

// @desc    Đăng ký đối tác và tạo khách sạn
// @route   POST /api/users/register-partner
// @access  Public
exports.registerPartner = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      // Thông tin người dùng
      name, 
      email, 
      phone,
      
      // Thông tin khách sạn
      hotelName, 
      hotelAddress, 
      hotelDescription,
      hotelLocationName,
      hotelLocationDescription,
      hotelCoordinates, 
      hotelAmenities,
      hotelWebsite,
      hotelFeaturedImage,
      hotelImages,
      
      // Chính sách khách sạn
      checkInTime,
      checkOutTime,
      cancellationPolicy,
      childrenPolicy,
      petPolicy,
      smokingPolicy 
    } = req.body;

    // Kiểm tra các trường bắt buộc
    if (!name || !email || !phone || !hotelName || !hotelAddress || !hotelCoordinates || !hotelDescription || !hotelLocationName) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin người dùng và khách sạn'
      });
    }

    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Email đã được sử dụng'
      });
    }

    // Tạo người dùng mới với vai trò 'partner'
    // Password sẽ được tạo ngẫu nhiên khi admin duyệt
    const user = await User.create([{
      name,
      email,
      phone,
      password: crypto.randomBytes(10).toString('hex'), // Mật khẩu tạm thời ngẫu nhiên
      role: 'partner',
      status: 'pending', // Trạng thái chờ duyệt cho đối tác
      isEmailVerified: false
    }], { session });

    const newUser = user[0];

    // Tạo khách sạn mới với ownerId là ID của người dùng vừa tạo
    const hotel = await Hotel.create([{
      name: hotelName,
      address: hotelAddress,
      description: hotelDescription,
      locationName: hotelLocationName,
      locationDescription: hotelLocationDescription,
      location: {
        type: 'Point',
        coordinates: hotelCoordinates // [longitude, latitude]
      },
      ownerId: newUser._id,
      website: hotelWebsite,
      featuredImage: hotelFeaturedImage,
      images: hotelImages || [],
      amenities: hotelAmenities || [],
      policies: {
        checkInTime: checkInTime || "14:00",
        checkOutTime: checkOutTime || "12:00",
        cancellationPolicy: cancellationPolicy || "no-refund",
        childrenPolicy: childrenPolicy || "",
        petPolicy: petPolicy || "",
        smokingPolicy: smokingPolicy || ""
      },
      status: 'pending' // Trạng thái chờ duyệt
    }], { session });

    // Tạo token xác thực email
    const verificationToken = newUser.getVerificationToken();
    await newUser.save({ session, validateBeforeSave: false });
    
    // Tạo URL xác thực
    const verificationUrl = `${config.clientUrl}/verify-email/${verificationToken}`;

    // Nội dung email
    const message = `
      <h1>Xác nhận đăng ký tài khoản đối tác</h1>
      <p>Cảm ơn bạn đã đăng ký tài khoản đối tác tại hệ thống của chúng tôi.</p>
      <p>Vui lòng nhấn vào đường dẫn sau để xác nhận email của bạn:</p>
      <a href="${verificationUrl}" target="_blank">Xác nhận email</a>
      <p>Đường dẫn có hiệu lực trong 24 giờ.</p>
      <p>Sau khi được phê duyệt, bạn sẽ nhận được email thông báo kèm theo thông tin đăng nhập.</p>
    `;
    
    try {
      await sendEmail({
        email: newUser.email,
        subject: 'Xác thực email đối tác',
        message
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message: 'Không thể gửi email xác thực. Vui lòng thử lại sau'
      });
    }

    // Commit giao dịch nếu mọi thứ thành công
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          status: newUser.status
        },
        hotel: hotel[0]
      },
      message: 'Đăng ký đối tác và khách sạn thành công. Vui lòng kiểm tra email để xác thực.'
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi đăng ký đối tác và khách sạn'
    });
  }
});

// @desc    Phê duyệt tài khoản đối tác
// @route   PUT /api/auth/approve-partner/:id
// @access  Admin
exports.approvePartner = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    if (user.role !== 'partner') {
      return res.status(400).json({
        success: false,
        message: 'Người dùng không phải là đối tác'
      });
    }

    // Tạo mật khẩu ngẫu nhiên
    const plainPassword = crypto.randomBytes(6).toString('hex');
    
    // Hash mật khẩu và cập nhật trạng thái người dùng
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(plainPassword, salt);
    user.status = 'active';
    await user.save();

    // Cập nhật trạng thái khách sạn
    const hotel = await Hotel.findOne({ ownerId: user._id });
    if (hotel) {
      hotel.status = 'active';
      await hotel.save();
    }

    // Gửi email thông báo kèm thông tin đăng nhập
    const message = `
      <h1>Tài khoản đối tác đã được phê duyệt</h1>
      <p>Chúc mừng! Tài khoản đối tác và khách sạn của bạn đã được phê duyệt.</p>
      <p>Bạn có thể đăng nhập và bắt đầu sử dụng các tính năng dành cho đối tác với thông tin sau:</p>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Mật khẩu:</strong> ${plainPassword}</p>
      <p>Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu để đảm bảo an toàn.</p>
    `;

    await sendEmail({
      email: user.email,
      subject: 'Tài khoản đối tác đã được phê duyệt',
      message
    });

    res.status(200).json({
      success: true,
      message: 'Đã phê duyệt tài khoản đối tác và gửi thông tin đăng nhập',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          status: user.status
        },
        hotel: hotel ? {
          _id: hotel._id,
          name: hotel.name,
          status: hotel.status
        } : null
      }
    });
  } catch (error) {
    console.error('Lỗi phê duyệt đối tác:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Từ chối tài khoản đối tác
// @route   PUT /api/auth/reject-partner/:id
// @access  Admin
exports.rejectPartner = async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp lý do từ chối'
      });
    }
    
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    if (user.role !== 'partner') {
      return res.status(400).json({
        success: false,
        message: 'Người dùng không phải là đối tác'
      });
    }

    user.status = 'rejected';
    await user.save();

    // Cập nhật trạng thái khách sạn
    const hotel = await Hotel.findOne({ ownerId: user._id });
    if (hotel) {
      hotel.status = 'inactive';
      await hotel.save();
    }

    // Gửi email thông báo
    const message = `
      <h1>Tài khoản đối tác không được phê duyệt</h1>
      <p>Rất tiếc! Tài khoản đối tác của bạn chưa được phê duyệt.</p>
      <p><strong>Lý do:</strong> ${reason}</p>
      <p>Bạn có thể cập nhật thông tin và gửi lại yêu cầu.</p>
    `;

    await sendEmail({
      email: user.email,
      subject: 'Tài khoản đối tác không được phê duyệt',
      message
    });

    res.status(200).json({
      success: true,
      message: 'Đã từ chối tài khoản đối tác',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          status: user.status
        }
      }
    });
  } catch (error) {
    console.error('Lỗi từ chối đối tác:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách đối tác chờ duyệt
// @route   GET /api/auth/pending-partners
// @access  Admin
exports.getPendingPartners = async (req, res) => {
  try {
    const partners = await User.find({
      role: 'partner',
      status: 'pending'
    }).select('-password -refreshToken');

    // Lấy thông tin khách sạn tương ứng với mỗi đối tác
    const partnersWithHotels = await Promise.all(
      partners.map(async (partner) => {
        const hotel = await Hotel.findOne({ 
          ownerId: partner._id,
          status: 'pending'
        }).populate('amenities');
        
        return {
          user: partner,
          hotel: hotel || null
        };
      })
    );

    res.status(200).json({
      success: true,
      count: partnersWithHotels.length,
      data: partnersWithHotels
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách đối tác chờ duyệt:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};