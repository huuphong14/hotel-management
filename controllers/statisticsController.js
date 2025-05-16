const asyncHandler = require('../middlewares/asyncHandler');
const Booking = require('../models/Booking');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const mongoose = require('mongoose');

// @desc    Tổng quan doanh thu
// @route   GET /api/statistics/summary
// @access  Private/Partner
exports.getRevenueSummary = asyncHandler(async (req, res) => {
  const { period = 'month' } = req.query; // Default to month
  const ownerId = req.user._id;

  const validPeriods = ['day', 'week', 'month', 'year'];
  if (!validPeriods.includes(period)) {
    return res.status(400).json({
      success: false,
      message: 'Period must be one of: day, week, month, year'
    });
  }

  const hotels = await Hotel.find({ ownerId }).select('_id');
  const hotelIds = hotels.map(hotel => hotel._id);

  if (!hotelIds.length) {
    return res.status(404).json({
      success: false,
      message: 'No hotels found for this partner'
    });
  }

  const now = new Date();
  let startDate, prevStartDate, prevEndDate;
  switch (period) {
    case 'day':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(startDate.getDate() - 1);
      prevEndDate = new Date(startDate);
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - now.getDay()));
      startDate.setHours(0, 0, 0, 0);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(startDate.getDate() - 7);
      prevEndDate = new Date(startDate);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
      prevEndDate = new Date(now.getFullYear(), 0, 0);
      break;
  }

  const currentStats = await Booking.aggregate([
    {
      $match: {
        room: { $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct('_id') },
        checkIn: { $gte: startDate },
        createdAt: { $lte: now }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$finalPrice' },
        totalBookings: { $sum: 1 },
        successfulBookings: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        cancelledBookings: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
        },
        pendingBookings: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);

  const previousStats = await Booking.aggregate([
    {
      $match: {
        room: { $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct('_id') },
        checkIn: { $gte: prevStartDate, $lte: prevEndDate }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$finalPrice' }
      }
    }
  ]);

  const stats = {
    totalRevenue: currentStats[0]?.totalRevenue || 0,
    totalBookings: currentStats[0]?.totalBookings || 0,
    successfulBookings: currentStats[0]?.successfulBookings || 0,
    cancelledBookings: currentStats[0]?.cancelledBookings || 0,
    pendingBookings: currentStats[0]?.pendingBookings || 0,
    previousPeriodRevenue: previousStats[0]?.totalRevenue || 0,
    revenueChange: currentStats[0]?.totalRevenue && previousStats[0]?.totalRevenue
      ? ((currentStats[0].totalRevenue - previousStats[0].totalRevenue) / previousStats[0].totalRevenue * 100).toFixed(2)
      : 0
  };

  res.status(200).json({
    success: true,
    data: stats
  });
});

// @desc    Biểu đồ doanh thu theo thời gian
// @route   GET /api/statistics/chart?from=yyyy-mm-dd&to=yyyy-mm-dd&groupBy=day|month
// @access  Private/Partner
exports.getRevenueChart = asyncHandler(async (req, res) => {
  const { from, to, groupBy = 'day' } = req.query;
  const ownerId = req.user._id;

  if (!from || !to) {
    return res.status(400).json({
      success: false,
      message: 'Please provide from and to dates'
    });
  }

  const startDate = new Date(from);
  const endDate = new Date(to);
  if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
    return res.status(400).json({
      success: false,
      message: 'Invalid date range'
    });
  }

  if (!['day', 'month'].includes(groupBy)) {
    return res.status(400).json({
      success: false,
      message: 'groupBy must be either "day" or "month"'
    });
  }

  const hotels = await Hotel.find({ ownerId }).select('_id');
  const hotelIds = hotels.map(hotel => hotel._id);

  if (!hotelIds.length) {
    return res.status(404).json({
      success: false,
      message: 'No hotels found for this partner'
    });
  }

  const groupFormat = groupBy === 'month'
    ? { $dateToString: { format: '%Y-%m', date: '$checkIn' } }
    : { $dateToString: { format: '%Y-%m-%d', date: '$checkIn' } };

  const chartData = await Booking.aggregate([
    {
      $match: {
        room: { $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct('_id') },
        checkIn: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: groupFormat,
        revenue: { $sum: '$finalPrice' },
        bookings: { $sum: 1 }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);

  res.status(200).json({
    success: true,
    data: chartData.map(item => ({
      period: item._id,
      revenue: item.revenue,
      bookings: item.bookings
    }))
  });
});

// @desc    Top phòng có doanh thu cao nhất
// @route   GET /api/statistics/top-rooms?limit=5
// @access  Private/Partner
exports.getTopRooms = asyncHandler(async (req, res) => {
  const { limit = 5, from, to } = req.query;
  const ownerId = req.user._id;

  const parsedLimit = parseInt(limit);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    return res.status(400).json({
      success: false,
      message: 'Limit must be a positive number'
    });
  }

  const hotels = await Hotel.find({ ownerId }).select('_id');
  const hotelIds = hotels.map(hotel => hotel._id);

  if (!hotelIds.length) {
    return res.status(404).json({
      success: false,
      message: 'No hotels found for this partner'
    });
  }

  const dateMatch = {};
  if (from && to) {
    const startDate = new Date(from);
    const endDate = new Date(to);
    if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range'
      });
    }
    dateMatch.checkIn = { $gte: startDate, $lte: endDate };
  }

  const topRooms = await Booking.aggregate([
    {
      $match: {
        room: { $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct('_id') },
        ...dateMatch
      }
    },
    {
      $group: {
        _id: '$room',
        totalRevenue: { $sum: '$finalPrice' },
        bookingCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'rooms',
        localField: '_id',
        foreignField: '_id',
        as: 'room'
      }
    },
    {
      $unwind: '$room'
    },
    {
      $lookup: {
        from: 'hotels',
        localField: 'room.hotelId',
        foreignField: '_id',
        as: 'hotel'
      }
    },
    {
      $unwind: '$hotel'
    },
    {
      $project: {
        roomName: '$room.name',
        hotelName: '$hotel.name',
        totalRevenue: 1,
        bookingCount: 1
      }
    },
    {
      $sort: { totalRevenue: -1 }
    },
    {
      $limit: parsedLimit
    }
  ]);

  res.status(200).json({
    success: true,
    data: topRooms
  });
});

// @desc    Thống kê booking
// @route   GET /api/statistics/booking
// @access  Private/Partner
exports.getBookingStatistics = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;

  const hotels = await Hotel.find({ ownerId }).select('_id');
  const hotelIds = hotels.map(hotel => hotel._id);

  if (!hotelIds.length) {
    return res.status(404).json({
      success: false,
      message: 'No hotels found for this partner'
    });
  }

  const stats = await Booking.aggregate([
    {
      $match: {
        room: { $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct('_id') }
      }
    },
    {
      $group: {
        _id: null,
        totalBookings: { $sum: 1 },
        successfulBookings: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        cancelledBookings: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
        },
        pendingBookings: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalBookings: stats[0]?.totalBookings || 0,
      successfulBookings: stats[0]?.successfulBookings || 0,
      cancelledBookings: stats[0]?.cancelledBookings || 0,
      pendingBookings: stats[0]?.pendingBookings || 0
    }
  });
});