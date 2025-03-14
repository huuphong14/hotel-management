const User = require('../models/User');
const crypto = require('crypto');
const { sendTokenResponse } = require('../utils/tokenUtils');
const sendEmail = require('../utils/sendEmail');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const passport = require('passport');

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

// @desc    Gửi OTP để đặt lại mật khẩu
// @route   POST /api/auth/forgot-password
// @access  Public
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Email không tồn tại trong hệ thống'
      });
    }

    const otp = generateOTP();
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(otp)
      .digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 phút
    await user.save({ validateBeforeSave: false });

    const message = `
      <h1>Đặt lại mật khẩu</h1>
      <p>Mã OTP của bạn là: <strong>${otp}</strong></p>
      <p>Mã OTP có hiệu lực trong 10 phút.</p>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Mã OTP đặt lại mật khẩu',
        message
      });

      res.status(200).json({
        success: true,
        message: 'Mã OTP đã được gửi đến email của bạn'
      });
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Không thể gửi email'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Xác thực OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(otp)
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

    res.status(200).json({
      success: true,
      message: 'Xác thực OTP thành công'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Đặt lại mật khẩu
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(otp)
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
    const { user } = req;
    
    // Kiểm tra xem user đã tồn tại chưa
    let existingUser = await User.findOne({ email: user.email });
    
    if (!existingUser) {
      // Tạo user mới nếu chưa tồn tại
      existingUser = await User.create({
        name: user.displayName,
        email: user.email,
        password: crypto.randomBytes(20).toString('hex'), // Tạo mật khẩu ngẫu nhiên
        isEmailVerified: true,
        provider: 'google'
      });
    }

    sendTokenResponse(existingUser, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
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
    const { user } = req;
    
    let existingUser = await User.findOne({ email: user.email });
    
    if (!existingUser) {
      existingUser = await User.create({
        name: user.displayName,
        email: user.email,
        password: crypto.randomBytes(20).toString('hex'),
        isEmailVerified: true,
        provider: 'facebook'
      });
    }

    sendTokenResponse(existingUser, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};