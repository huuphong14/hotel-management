const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Hotel = require('../models/Hotel');
const Review = require('../models/Review');
const User = require('../models/User');
const Room = require('../models/Room');
const asyncHandler = require('../middlewares/asyncHandler');

// Thống kê doanh thu
exports.getRevenueStatistics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, hotelId, groupBy } = req.query;
  const user = req.user;

  // Xác định khoảng thời gian
  const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  const end = endDate ? new Date(endDate) : new Date();

  // Kiểm tra định dạng groupBy
  const validGroupBy = ['day', 'week', 'month', 'year'].includes(groupBy) ? groupBy : 'month';

  // Điều kiện lọc
  let matchConditions = {
    status: { $in: ['confirmed', 'completed'] },
    checkIn: { $gte: start, $lte: end }
  };

  // Nếu là partner, chỉ lấy doanh thu từ khách sạn của họ
  if (user.role === 'partner') {
    const hotels = await Hotel.find({ ownerId: user._id }).select('_id');
    const hotelIds = hotels.map(hotel => hotel._id);
    matchConditions.room = {
      $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct('_id')
    };
  } else if (hotelId) {
    // Nếu admin chỉ định hotelId
    matchConditions.room = {
      $in: await Room.find({ hotelId: new mongoose.Types.ObjectId(hotelId) }).distinct('_id')
    };
  }

  // Aggregation pipeline
  const revenueStats = await Booking.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: {
          $dateToString: {
            format: validGroupBy === 'day' ? '%Y-%m-%d' :
                   validGroupBy === 'week' ? '%Y-%U' :
                   validGroupBy === 'month' ? '%Y-%m' : '%Y',
            date: '$checkIn'
          }
        },
        totalRevenue: { $sum: '$finalPrice' },
        bookingCount: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // Tính tổng doanh thu
  const totalRevenue = revenueStats.reduce((sum, stat) => sum + stat.totalRevenue, 0);

  res.status(200).json({
    success: true,
    totalRevenue,
    data: revenueStats
  });
});

// Thống kê đặt phòng
exports.getBookingStatistics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, hotelId, status } = req.query;
  const user = req.user;

  const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  const end = endDate ? new Date(endDate) : new Date();

  let matchConditions = {
    checkIn: { $gte: start, $lte: end }
  };

  if (status) {
    matchConditions.status = status;
  }

  if (user.role === 'partner') {
    const hotels = await Hotel.find({ ownerId: user._id }).select('_id');
    const hotelIds = hotels.map(hotel => hotel._id);
    matchConditions.room = {
      $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct('_id')
    };
  } else if (hotelId) {
    matchConditions.room = {
      $in: await Room.find({ hotelId: new mongoose.Types.ObjectId(hotelId) }).distinct('_id')
    };
  }

  const bookingStats = await Booking.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: bookingStats
  });
});

// Thống kê đánh giá
exports.getReviewStatistics = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.query;
  const user = req.user;

  let matchConditions = {};

  if (user.role === 'partner') {
    const hotels = await Hotel.find({ ownerId: user._id }).select('_id');
    matchConditions.hotelId = { $in: hotels.map(hotel => hotel._id) };
  } else if (hotelId) {
    matchConditions.hotelId = new mongoose.Types.ObjectId(hotelId);
  }

  const reviewStats = await Review.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  const totalReviews = reviewStats.reduce((sum, stat) => sum + stat.count, 0);
  const averageRating = totalReviews
    ? (reviewStats.reduce((sum, stat) => sum + stat._id * stat.count, 0) / totalReviews).toFixed(1)
    : 0;

  res.status(200).json({
    success: true,
    totalReviews,
    averageRating,
    data: reviewStats
  });
});

// Thống kê người dùng
exports.getUserStatistics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  const end = endDate ? new Date(endDate) : new Date();

  const userStats = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m', date: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  const totalUsers = await User.countDocuments();

  res.status(200).json({
    success: true,
    totalUsers,
    data: userStats
  });
});

// Thống kê phòng
exports.getRoomStatistics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, hotelId } = req.query;
  const user = req.user;

  const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  const end = endDate ? new Date(endDate) : new Date();

  let matchConditions = {
    checkIn: { $gte: start, $lte: end }
  };

  if (user.role === 'partner') {
    const hotels = await Hotel.find({ ownerId: user._id }).select('_id');
    const hotelIds = hotels.map(hotel => hotel._id);
    matchConditions.room = {
      $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct('_id')
    };
  } else if (hotelId) {
    matchConditions.room = {
      $in: await Room.find({ hotelId: new mongoose.Types.ObjectId(hotelId) }).distinct('_id')
    };
  }

  const roomStats = await Booking.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: '$room',
        bookingCount: { $sum: 1 },
        totalRevenue: { $sum: '$finalPrice' }
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
    { $unwind: '$room' },
    {
      $project: {
        roomType: '$room.roomType',
        bedType: '$room.bedType',
        bookingCount: 1,
        totalRevenue: 1
      }
    },
    { $sort: { bookingCount: -1 } }
  ]);

  res.status(200).json({
    success: true,
    data: roomStats
  });
});