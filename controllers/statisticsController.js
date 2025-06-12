const asyncHandler = require("../middlewares/asyncHandler");
const Booking = require("../models/Booking");
const Hotel = require("../models/Hotel");
const Room = require("../models/Room");

/**
 * @swagger
 * /api/statistics/summary:
 *   get:
 *     summary: "Tổng quan doanh thu"
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *         description: "Khoảng thời gian thống kê (mặc định: month)"
 *     responses:
 *       200:
 *         description: "Lấy tổng quan doanh thu thành công"
 *       400:
 *         description: "Tham số không hợp lệ"
 *       404:
 *         description: "Không tìm thấy khách sạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.getRevenueSummary = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query; // Default to month
  const ownerId = req.user._id;

  const validPeriods = ["day", "week", "month", "year"];
  if (!validPeriods.includes(period)) {
    return res.status(400).json({
      success: false,
      message: "Period must be one of: day, week, month, year",
    });
  }

  const hotels = await Hotel.find({ ownerId }).select("_id");
  const hotelIds = hotels.map((hotel) => hotel._id);

  if (!hotelIds.length) {
    return res.status(404).json({
      success: false,
      message: "No hotels found for this partner",
    });
  }

  const now = new Date();
  let startDate, prevStartDate, prevEndDate;
  switch (period) {
    case "day":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(startDate.getDate() - 1);
      prevEndDate = new Date(startDate);
      break;
    case "week":
      startDate = new Date(now.setDate(now.getDate() - now.getDay()));
      startDate.setHours(0, 0, 0, 0);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(startDate.getDate() - 7);
      prevEndDate = new Date(startDate);
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
      prevEndDate = new Date(now.getFullYear(), 0, 0);
      break;
  }

  const currentStats = await Booking.aggregate([
    {
      $match: {
        room: {
          $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct("_id"),
        },
        checkIn: { $gte: startDate },
        createdAt: { $lte: now },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$finalPrice" },
        totalBookings: { $sum: 1 },
        successfulBookings: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        cancelledBookings: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
        },
        pendingBookings: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
      },
    },
  ]);

  const previousStats = await Booking.aggregate([
    {
      $match: {
        room: {
          $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct("_id"),
        },
        checkIn: { $gte: prevStartDate, $lte: prevEndDate },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$finalPrice" },
      },
    },
  ]);

  const stats = {
    totalRevenue: currentStats[0]?.totalRevenue || 0,
    totalBookings: currentStats[0]?.totalBookings || 0,
    successfulBookings: currentStats[0]?.successfulBookings || 0,
    cancelledBookings: currentStats[0]?.cancelledBookings || 0,
    pendingBookings: currentStats[0]?.pendingBookings || 0,
    previousPeriodRevenue: previousStats[0]?.totalRevenue || 0,
    revenueChange:
      currentStats[0]?.totalRevenue && previousStats[0]?.totalRevenue
        ? (
            ((currentStats[0].totalRevenue - previousStats[0].totalRevenue) /
              previousStats[0].totalRevenue) *
            100
          ).toFixed(2)
        : 0,
  };

  res.status(200).json({
    success: true,
    data: stats,
  });
});

/**
 * @swagger
 * /api/statistics/chart:
 *   get:
 *     summary: "Biểu đồ doanh thu theo thời gian"
 *     tags: [Statistics]
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
 *       404:
 *         description: "Không tìm thấy khách sạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.getRevenueChart = asyncHandler(async (req, res) => {
  const { from, to, groupBy = "day" } = req.query;
  const ownerId = req.user._id;

  if (!from || !to) {
    return res.status(400).json({
      success: false,
      message: "Please provide from and to dates",
    });
  }

  const startDate = new Date(from);
  const endDate = new Date(to);
  if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
    return res.status(400).json({
      success: false,
      message: "Invalid date range",
    });
  }

  if (!["day", "month"].includes(groupBy)) {
    return res.status(400).json({
      success: false,
      message: 'groupBy must be either "day" or "month"',
    });
  }

  const hotels = await Hotel.find({ ownerId }).select("_id");
  const hotelIds = hotels.map((hotel) => hotel._id);

  if (!hotelIds.length) {
    return res.status(404).json({
      success: false,
      message: "No hotels found for this partner",
    });
  }

  const groupFormat =
    groupBy === "month"
      ? { $dateToString: { format: "%Y-%m", date: "$checkIn" } }
      : { $dateToString: { format: "%Y-%m-%d", date: "$checkIn" } };

  const chartData = await Booking.aggregate([
    {
      $match: {
        room: {
          $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct("_id"),
        },
        checkIn: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupFormat,
        revenue: { $sum: "$finalPrice" },
        bookings: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  res.status(200).json({
    success: true,
    data: chartData.map((item) => ({
      period: item._id,
      revenue: item.revenue,
      bookings: item.bookings,
    })),
  });
});

/**
 * @swagger
 * /api/statistics/top-rooms:
 *   get:
 *     summary: "Top phòng có doanh thu cao nhất"
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: "Số lượng phòng trả về (mặc định: 5)"
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
 *         description: "Lấy top phòng thành công"
 *       400:
 *         description: "Tham số không hợp lệ"
 *       404:
 *         description: "Không tìm thấy khách sạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.getTopRooms = asyncHandler(async (req, res) => {
  const { limit = 5, from, to } = req.query;
  const ownerId = req.user._id;

  const parsedLimit = parseInt(limit);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    return res.status(400).json({
      success: false,
      message: "Limit must be a positive number",
    });
  }

  const hotels = await Hotel.find({ ownerId }).select("_id");
  const hotelIds = hotels.map((hotel) => hotel._id);

  if (!hotelIds.length) {
    return res.status(404).json({
      success: false,
      message: "No hotels found for this partner",
    });
  }

  const dateMatch = {};
  if (from && to) {
    const startDate = new Date(from);
    const endDate = new Date(to);
    if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range",
      });
    }
    dateMatch.checkIn = { $gte: startDate, $lte: endDate };
  }

  const topRooms = await Booking.aggregate([
    {
      $match: {
        room: {
          $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct("_id"),
        },
        ...dateMatch,
      },
    },
    {
      $group: {
        _id: "$room",
        totalRevenue: { $sum: "$finalPrice" },
        bookingCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "rooms",
        localField: "_id",
        foreignField: "_id",
        as: "room",
      },
    },
    {
      $unwind: "$room",
    },
    {
      $lookup: {
        from: "hotels",
        localField: "room.hotelId",
        foreignField: "_id",
        as: "hotel",
      },
    },
    {
      $unwind: "$hotel",
    },
    {
      $project: {
        roomName: "$room.name",
        hotelName: "$hotel.name",
        totalRevenue: 1,
        bookingCount: 1,
      },
    },
    {
      $sort: { totalRevenue: -1 },
    },
    {
      $limit: parsedLimit,
    },
  ]);

  res.status(200).json({
    success: true,
    data: topRooms,
  });
});

/**
 * @swagger
 * /api/statistics/booking:
 *   get:
 *     summary: "Thống kê booking"  
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Lấy thống kê booking thành công"
 *       404:
 *         description: "Không tìm thấy khách sạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.getBookingStatistics = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;

  const hotels = await Hotel.find({ ownerId }).select("_id");
  const hotelIds = hotels.map((hotel) => hotel._id);

  if (!hotelIds.length) {
    return res.status(404).json({
      success: false,
      message: "No hotels found for this partner",
    });
  }

  const stats = await Booking.aggregate([
    {
      $match: {
        room: {
          $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct("_id"),
        },
      },
    },
    {
      $group: {
        _id: null,
        totalBookings: { $sum: 1 },
        successfulBookings: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        cancelledBookings: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
        },
        pendingBookings: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalBookings: stats[0]?.totalBookings || 0,
      successfulBookings: stats[0]?.successfulBookings || 0,
      cancelledBookings: stats[0]?.cancelledBookings || 0,
      pendingBookings: stats[0]?.pendingBookings || 0,
    },
  });
});
