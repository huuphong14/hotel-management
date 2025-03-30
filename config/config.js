const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  port: process.env.PORT || 5000,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpire: process.env.JWT_ACCESS_EXPIRE,
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE,
  cookieExpire: parseInt(process.env.COOKIE_EXPIRE) || 30,
  emailService: process.env.EMAIL_SERVICE,
  emailUsername: process.env.EMAIL_USERNAME,
  emailPassword: process.env.EMAIL_PASSWORD,
  emailFrom: process.env.EMAIL_FROM,
  serverUrl: process.env.SERVER_URL,
  clientUrl: process.env.CLIENT_URL,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  },
  facebook: {
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET
  }
};