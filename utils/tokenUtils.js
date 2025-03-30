const jwt = require('jsonwebtoken');
const config = require('../config/config');

// Tạo token và lưu vào cookie
const sendTokenResponse = async (user, statusCode, res) => {
  const accessToken = user.getAccessToken();
  const refreshToken = user.getRefreshToken();
  console.log('Access Token:', accessToken);
  console.log('Refresh Token:', refreshToken);
  // Lưu refresh token vào DB
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  const options = {
    expires: new Date(Date.now() + config.cookieExpire * 24 * 60 * 60 * 1000),
    httpOnly: true,
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  res.status(statusCode)
    .cookie('token', accessToken, options)
    .cookie('refreshToken', refreshToken, { ...options, expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }) // Lưu refresh token lâu hơn
    .json({
      success: true,
      accessToken,
      refreshToken,
    });
};

module.exports = { sendTokenResponse };
