const asyncHandler = require('../middlewares/asyncHandler');
const User = require('../models/User');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const mongoose = require('mongoose');

// @desc    Tổng quan hệ thống
// @route   GET /api/admin-statistics/system-overview
// @access  Private/Admin
exports.getSystemOverview = asyncHandler(async (req, res) => {
  const totalPartners = await User.countDocuments({ role: 'partner' });
  const totalUsers = await User.countDocuments({ role: 'user' });
  const totalHotels = await Hotel.countDocuments();
  const totalBookings = await Booking.countDocuments();
  const totalRevenue = await Booking.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$finalPrice' } } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalPartners,
      totalUsers,
      totalHotels,
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0
    }
  });
});

// @desc    Thống kê booking theo trạng thái
// @route   GET /api/admin-statistics/booking-status
// @access  Private/Admin
exports.getBookingStatus = asyncHandler(async (req, res) => {
  const stats = await Booking.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    completed: 0
  };

  stats.forEach(stat => {
    result[stat._id] = stat.count;
  });

  res.status(200).json({
    success: true,
    data: result
  });
});

// @desc    Thống kê khách sạn theo trạng thái
// @route   GET /api/admin-statistics/hotel-status
// @access  Private/Admin
exports.getHotelStatus = asyncHandler(async (req, res) => {
  const stats = await Hotel.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    active: 0,
    inactive: 0,
    pending: 0
  };

  stats.forEach(stat => {
    result[stat._id] = stat.count;
  });

  res.status(200).json({
    success: true,
    data: result
  });
});

// @desc    Dữ liệu biểu đồ theo thời gian
// @route   GET /api/admin-statistics/chart-data?from=yyyy-mm-dd&to=yyyy-mm-dd&groupBy=day|month
// @access  Private/Admin
exports.getChartData = asyncHandler(async (req, res) => {
  const { from, to, groupBy = 'day' } = req.query;

  // Xác thực đầu vào
  if (!from || !to) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp ngày bắt đầu (from) và ngày kết thúc (to)'
    });
  }

  const startDate = new Date(from);
  const endDate = new Date(to);
  if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
    return res.status(400).json({
      success: false,
      message: 'Khoảng thời gian không hợp lệ'
    });
  }

  if (!['day', 'month'].includes(groupBy)) {
    return res.status(400).json({
      success: false,
      message: "groupBy phải là 'day' hoặc 'month'"
    });
  }

  // Định dạng nhóm theo ngày hoặc tháng
  const groupFormat = groupBy === 'month'
    ? { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
    : { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };

  // Thống kê booking mới
  const newBookings = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: groupFormat,
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // Thống kê người dùng mới
  const newUsers = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: groupFormat,
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // Thống kê khách sạn mới
  const newHotels = await Hotel.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: groupFormat,
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // Thống kê doanh thu
  const revenue = await Booking.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: groupFormat,
        total: { $sum: '$finalPrice' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // Gộp dữ liệu
  const periods = [...new Set([
    ...newBookings.map(b => b._id),
    ...newUsers.map(u => u._id),
    ...newHotels.map(h => h._id),
    ...revenue.map(r => r._id)
  ])].sort();

  const chartData = periods.map(period => ({
    period,
    newBookings: newBookings.find(b => b._id === period)?.count || 0,
    newUsers: newUsers.find(u => u._id === period)?.count || 0,
    newHotels: newHotels.find(h => h._id === period)?.count || 0,
    revenue: revenue.find(r => r._id === period)?.total || 0
  }));

  res.status(200).json({
    success: true,
    data: chartData
  });
});

// @desc    Top khách sạn có nhiều booking nhất
// @route   GET /api/admin-statistics/top-hotels?limit=5
// @access  Private/Admin
exports.getTopHotelsByBookings = asyncHandler(async (req, res) => {
  const { limit = 5, from, to } = req.query;

  // Xác thực limit
  const parsedLimit = parseInt(limit);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    return res.status(400).json({
      success: false,
      message: 'Limit phải là số dương'
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
        message: 'Khoảng thời gian không hợp lệ'
      });
    }
    dateMatch.createdAt = { $gte: startDate, $lte: endDate };
  }

  // Lấy danh sách phòng
  const hotelIds = await Room.find().distinct('hotelId');

  // Thống kê booking theo khách sạn
  const topHotels = await Booking.aggregate([
    {
      $match: {
        room: { $in: await Room.find().distinct('_id') },
        ...dateMatch
      }
    },
    {
      $lookup: {
        from: 'rooms',
        localField: 'room',
        foreignField: '_id',
        as: 'room'
      }
    },
    { $unwind: '$room' },
    {
      $group: {
        _id: '$room.hotelId',
        bookingCount: { $sum: 1 },
        totalRevenue: { $sum: '$finalPrice' }
      }
    },
    {
      $lookup: {
        from: 'hotels',
        localField: '_id',
        foreignField: '_id',
        as: 'hotel'
      }
    },
    { $unwind: '$hotel' },
    {
      $project: {
        hotelName: '$hotel.name',
        bookingCount: 1,
        totalRevenue: 1
      }
    },
    { $sort: { bookingCount: -1 } },
    { $limit: parsedLimit }
  ]);

  res.status(200).json({
    success: true,
    data: topHotels
  });
});

// @desc    Top người dùng có nhiều booking nhất
// @route   GET /api/admin-statistics/top-users?limit=5
// @access  Private/Admin
exports.getTopUsersByBookings = asyncHandler(async (req, res) => {
  const { limit = 5, from, to } = req.query;

  // Xác thực limit
  const parsedLimit = parseInt(limit);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    return res.status(400).json({
      success: false,
      message: 'Limit phải là số dương'
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
        message: 'Khoảng thời gian không hợp lệ'
      });
    }
    dateMatch.createdAt = { $gte: startDate, $lte: endDate };
  }

  // Thống kê booking theo người dùng
  const topUsers = await Booking.aggregate([
    {
      $match: {
        ...dateMatch
      }
    },
    {
      $group: {
        _id: '$user',
        bookingCount: { $sum: 1 },
        totalSpent: { $sum: '$finalPrice' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        userName: '$user.name',
        userEmail: '$user.email',
        bookingCount: 1,
        totalSpent: 1
      }
    },
    { $sort: { bookingCount: -1 } },
    { $limit: parsedLimit }
  ]);

  res.status(200).json({
    success: true,
    data: topUsers
  });
});