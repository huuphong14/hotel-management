const asyncHandler = require("../middlewares/asyncHandler");
const User = require("../models/User");
const Hotel = require("../models/Hotel");
const Booking = require("../models/Booking");
const Room = require("../models/Room");

/**
 * @swagger
 * /api/admin-statistics/system-overview:
 *   get:
 *     summary: "Tổng quan hệ thống"
 *     tags: [AdminStatistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Lấy tổng quan hệ thống thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getSystemOverview = asyncHandler(async (req, res) => {
  const totalPartners = await User.countDocuments({ role: "partner" });
  const totalUsers = await User.countDocuments({ role: "user" });
  const totalHotels = await Hotel.countDocuments();
  const totalBookings = await Booking.countDocuments();
  const totalRevenue = await Booking.aggregate([
    { $match: { status: "completed" } },
    { $group: { _id: null, total: { $sum: "$finalPrice" } } },
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalPartners,
      totalUsers,
      totalHotels,
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
    },
  });
});

/**
 * @swagger
 * /api/admin-statistics/booking-status:
 *   get:
 *     summary: "Thống kê booking theo trạng thái"
 *     tags: [AdminStatistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Lấy thống kê booking thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getBookingStatus = asyncHandler(async (req, res) => {
  const stats = await Booking.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    completed: 0,
  };

  stats.forEach((stat) => {
    result[stat._id] = stat.count;
  });

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @swagger
 * /api/admin-statistics/hotel-status:
 *   get:
 *     summary: "Thống kê khách sạn theo trạng thái"
 *     tags: [AdminStatistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Lấy thống kê khách sạn thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getHotelStatus = asyncHandler(async (req, res) => {
  const stats = await Hotel.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    active: 0,
    inactive: 0,
    pending: 0,
  };

  stats.forEach((stat) => {
    result[stat._id] = stat.count;
  });

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @swagger
 * /api/admin-statistics/chart-data:
 *   get:
 *     summary: "Dữ liệu biểu đồ theo thời gian"
 *     tags: [AdminStatistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: "Ngày bắt đầu"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: "Ngày kết thúc"
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, month]
 *         description: "Nhóm theo ngày hoặc tháng (mặc định: day)"
 *     responses:
 *       200:
 *         description: "Lấy dữ liệu biểu đồ thành công"
 *       400:
 *         description: "Tham số không hợp lệ"
 *       500:
 *         description: "Lỗi server"
 */
exports.getChartData = asyncHandler(async (req, res) => {
  const { from, to, groupBy = "day" } = req.query;

  // Xác thực đầu vào
  if (!from || !to) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng cung cấp ngày bắt đầu (from) và ngày kết thúc (to)",
    });
  }

  const startDate = new Date(from);
  const endDate = new Date(to);
  if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
    return res.status(400).json({
      success: false,
      message: "Khoảng thời gian không hợp lệ",
    });
  }

  if (!["day", "month"].includes(groupBy)) {
    return res.status(400).json({
      success: false,
      message: "groupBy phải là 'day' hoặc 'month'",
    });
  }

  // Định dạng nhóm theo ngày hoặc tháng
  const groupFormat =
    groupBy === "month"
      ? { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
      : { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };

  // Thống kê booking mới
  const newBookings = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupFormat,
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Thống kê người dùng mới
  const newUsers = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupFormat,
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Thống kê khách sạn mới
  const newHotels = await Hotel.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupFormat,
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Thống kê doanh thu
  const revenue = await Booking.aggregate([
    {
      $match: {
        status: "completed",
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupFormat,
        total: { $sum: "$finalPrice" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Gộp dữ liệu
  const periods = [
    ...new Set([
      ...newBookings.map((b) => b._id),
      ...newUsers.map((u) => u._id),
      ...newHotels.map((h) => h._id),
      ...revenue.map((r) => r._id),
    ]),
  ].sort();

  const chartData = periods.map((period) => ({
    period,
    newBookings: newBookings.find((b) => b._id === period)?.count || 0,
    newUsers: newUsers.find((u) => u._id === period)?.count || 0,
    newHotels: newHotels.find((h) => h._id === period)?.count || 0,
    revenue: revenue.find((r) => r._id === period)?.total || 0,
  }));

  res.status(200).json({
    success: true,
    data: chartData,
  });
});

/**
 * @swagger
 * /api/admin-statistics/top-hotels:
 *   get:
 *     summary: "Top khách sạn có nhiều booking nhất"
 *     tags: [AdminStatistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: "Số lượng khách sạn trả về (mặc định: 5)"
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: "Ngày bắt đầu"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: "Ngày kết thúc"
 *     responses:
 *       200:
 *         description: "Lấy top khách sạn thành công"
 *       400:
 *         description: "Tham số không hợp lệ"
 *       500:
 *         description: "Lỗi server"
 */
exports.getTopHotelsByBookings = asyncHandler(async (req, res) => {
  const { limit = 5, from, to } = req.query;

  // Xác thực limit
  const parsedLimit = parseInt(limit);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    return res.status(400).json({
      success: false,
      message: "Limit phải là số dương",
    });
  }

  // Xác thực khoảng thời gian
  const dateMatch = {};
  if (from && to) {
    const startDate = new Date(from);
    const endDate = new Date(to);
    if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: "Khoảng thời gian không hợp lệ",
      });
    }
    dateMatch.createdAt = { $gte: startDate, $lte: endDate };
  }

  // Lấy danh sách phòng
  const hotelIds = await Room.find().distinct("hotelId");

  // Thống kê booking theo khách sạn
  const topHotels = await Booking.aggregate([
    {
      $match: {
        status: { $in: ["confirmed", "completed"] },
        room: { $in: await Room.find().distinct("_id") },
        ...dateMatch,
      },
    },
    {
      $lookup: {
        from: "rooms",
        localField: "room",
        foreignField: "_id",
        as: "room",
      },
    },
    { $unwind: "$room" },
    {
      $group: {
        _id: "$room.hotelId",
        bookingCount: { $sum: 1 },
        totalRevenue: { $sum: "$finalPrice" },
      },
    },
    {
      $lookup: {
        from: "hotels",
        localField: "_id",
        foreignField: "_id",
        as: "hotel",
      },
    },
    { $unwind: "$hotel" },
    {
      $project: {
        hotelName: "$hotel.name",
        bookingCount: 1,
        totalRevenue: 1,
      },
    },
    { $sort: { bookingCount: -1 } },
    { $limit: parsedLimit },
  ]);

  res.status(200).json({
    success: true,
    data: topHotels,
  });
});

/**
 * @swagger
 * /api/admin-statistics/top-users:
 *   get:
 *     summary: "Top người dùng có nhiều booking nhất"
 *     tags: [AdminStatistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: "Số lượng người dùng trả về (mặc định: 5)"
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: "Ngày bắt đầu"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: "Ngày kết thúc"
 *     responses:
 *       200:
 *         description: "Lấy top người dùng thành công"
 *       400:
 *         description: "Tham số không hợp lệ"
 *       500:
 *         description: "Lỗi server"
 */
exports.getTopUsersByBookings = asyncHandler(async (req, res) => {
  const { limit = 5, from, to } = req.query;

  // Xác thực limit
  const parsedLimit = parseInt(limit);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    return res.status(400).json({
      success: false,
      message: "Limit phải là số dương",
    });
  }

  // Xác thực khoảng thời gian
  const dateMatch = {};
  if (from && to) {
    const startDate = new Date(from);
    const endDate = new Date(to);
    if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: "Khoảng thời gian không hợp lệ",
      });
    }
    dateMatch.createdAt = { $gte: startDate, $lte: endDate };
  }

  // Thống kê booking theo người dùng
  const topUsers = await Booking.aggregate([
    {
      $match: {
        ...dateMatch,
        status: { $in: ["confirmed", "completed"] },
      },
    },
    {
      $group: {
        _id: "$user",
        bookingCount: { $sum: 1 },
        totalSpent: { $sum: "$finalPrice" },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        userName: "$user.name",
        userEmail: "$user.email",
        bookingCount: 1,
        totalSpent: 1,
      },
    },
    { $sort: { bookingCount: -1 } },
    { $limit: parsedLimit },
  ]);

  res.status(200).json({
    success: true,
    data: topUsers,
  });
});
