const express = require("express");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const connectDB = require("./config/db");
const config = require("./config/config");
const passport = require("passport");
const session = require("express-session");
const http = require("http");
const socketIO = require("./utils/socket");
const { scheduleUpdateLowestPrices } = require("./utils/cronJobs");
const { scheduleUserTierUpdate } = require("./utils/userTierScheduler");
const cancelExpiredBookings = require("./jobs/cancelExpiredBookings");
const promClient = require("prom-client");
const cron = require("node-cron");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const dialogflowController = require("./controllers/dialogflowController");

// Load các routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const hotelRoutes = require("./routes/hotelRoutes");
const roomRoutes = require("./routes/roomRoutes");
const postRoutes = require("./routes/postRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const chatRoutes = require("./routes/chatRoutes"); 
const chatbotRoutes = require("./routes/chatbotRoutes");
const voucherRoutes = require("./routes/voucherRoutes");
const amenityRoute = require("./routes/amenityroute");
const favoriteRoutes = require("./routes/favoriteRoutes");
const locationRoutes = require("./routes/locationRoutes");
const statisticsRoutes = require("./routes/statisticsRoutes");
const adminStatisticsRoutes = require("./routes/adminStatisticsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const webhook = require("./routes/webhook");
const upload = require("./routes/upload");
const geminiRoutes = require("./routes/geminiRoutes");

// Khởi tạo express
const app = express();
const server = http.createServer(app);

// Kết nối đến database
connectDB();

// Cấu hình Prometheus
promClient.collectDefaultMetrics();
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "code"],
  buckets: [50, 100, 200, 300, 500, 1000, 2000],
});

// Middleware để đo thời gian xử lý request
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    httpRequestDurationMicroseconds
      .labels(req.method, req.originalUrl, res.statusCode)
      .observe(duration);
  });
  next();
});

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// Cấu hình session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 giờ
    },
  })
);

// Khởi tạo passport
app.use(passport.initialize());
app.use(passport.session());

// Import cấu hình passport
require("./config/passport");

// Khởi tạo Socket.IO
socketIO.init(server);

// Cấu hình cron jobs
scheduleUpdateLowestPrices();
cron.schedule("0 * * * *", cancelExpiredBookings); // Chạy mỗi giờ để hủy booking quá hạn
scheduleUserTierUpdate();

// Route để expose Prometheus metrics
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (error) {
    console.error("Error exposing metrics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching metrics",
    });
  }
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/hotels", hotelRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/chats", chatRoutes); // Routes cho Dialogflow CX
app.use("/api/chatbot", chatbotRoutes); // Routes mới cho chatbot
app.use("/api/vouchers", voucherRoutes);
app.use("/api/amenities", amenityRoute);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/admin-statistics", adminStatisticsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/webhook", webhook);
app.use("/api/uploads", upload);
app.use("/api/gemini", geminiRoutes);

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Route mặc định
app.get("/", (req, res) => {
  res.send("API đang chạy");
});

// Xử lý route không tồn tại
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API không tồn tại",
  });
});

// Xử lý lỗi toàn cục
app.use((err, req, res, next) => {
  console.error("Server error:", {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
  });
  res.status(500).json({
    success: false,
    message: "Lỗi server",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Khởi động server
const PORT = config.port;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API docs: http://localhost:${PORT}/api-docs`);
  try {
    const isDialogflowHealthy = await dialogflowController.testConnection();
    console.log(
      `Dialogflow connection: ${isDialogflowHealthy ? "healthy" : "unhealthy"}`
    );
  } catch (error) {
    console.error("Dialogflow connection test failed:", error.message);
    console.log("Dialogflow connection: unhealthy");
  }
});

// Xử lý lỗi không bắt được
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});
