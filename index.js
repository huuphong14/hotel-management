const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const connectDB = require('./config/db');
const config = require('./config/config');
const passport = require('passport');
const session = require('express-session');
const http = require('http');
const socketIO = require('./utils/socket');

// Load các routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const hotelRoutes = require('./routes/hotelRoutes');
const roomRoutes = require('./routes/roomRoutes')
const postRoutes = require('./routes/postRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const chatRoutes = require('./routes/chatRoutes');
const voucherRoutes = require('./routes/voucherRoutes');
const amenityRoute = require('./routes/amenityroute');
const favoriteRoutes = require('./routes/favoriteRoutes');

// Khởi tạo express
const app = express();
const server = http.createServer(app);

// Kết nối đến database
connectDB();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: config.clientUrl,
  credentials: true
}));

// Cấu hình session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Khởi tạo passport
app.use(passport.initialize());
app.use(passport.session());

// Import cấu hình passport
require('./config/passport');

// Khởi tạo Socket.IO
socketIO.init(server);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', favoriteRoutes, userRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/amenities', amenityRoute);

// Route mặc định
app.get('/', (req, res) => {
  res.send('API đang chạy');
});

// Xử lý route không tồn tại
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API không tồn tại'
  });
});

// Khởi động server
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});