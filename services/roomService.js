const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Room = require('../models/Room');

/**
 * Lấy danh sách ID phòng đã đặt trong khoảng thời gian.
 * @param {Date} checkIn - Ngày nhận phòng.
 * @param {Date} checkOut - Ngày trả phòng.
 * @returns {Promise<string[]>} Mảng ID phòng đã đặt.
 */
async function getBookedRoomIds(checkIn, checkOut) {
  const checkInTime = new Date(checkIn);
  checkInTime.setHours(14, 0, 0, 0); // Check-in 14:00
  const checkOutTime = new Date(checkOut);
  checkOutTime.setHours(12, 0, 0, 0); // Check-out 12:00

  console.log('getBookedRoomIds - checkInTime:', checkInTime.toISOString(), 'checkOutTime:', checkOutTime.toISOString());

  const bookedRooms = await Booking.find({
    status: { $in: ['pending', 'confirmed'] },
    $or: [
      { checkIn: { $lte: checkOutTime }, checkOut: { $gte: checkInTime } }
    ]
  }).distinct('room');

  const bookedRoomIds = bookedRooms.map(id => id.toString());
  console.log('bookedRoomIds:', bookedRoomIds);

  return bookedRoomIds;
}

/**
 * Kiểm tra xem một phòng có sẵn trong khoảng thời gian cụ thể hay không.
 * @param {string} roomId - ID của phòng cần kiểm tra.
 * @param {Date} checkIn - Ngày nhận phòng.
 * @param {Date} checkOut - Ngày trả phòng.
 * @returns {Promise<boolean>} True nếu phòng có sẵn, False nếu không.
 * @throws {Error} Nếu roomId hoặc ngày không hợp lệ.
 */
async function checkRoomAvailability(roomId, checkIn, checkOut) {
  if (!mongoose.isValidObjectId(roomId)) {
    throw new Error('Invalid roomId');
  }
  if (!(checkIn instanceof Date) || !(checkOut instanceof Date) || isNaN(checkIn) || isNaN(checkOut)) {
    throw new Error('Invalid check-in or check-out date');
  }
  if (checkOut <= checkIn) {
    throw new Error('Check-out date must be after check-in date');
  }

  const room = await Room.findById(roomId);
  if (!room || room.status !== 'available') {
    console.log(`Room ${roomId} is not available or does not exist`);
    return false;
  }

  const bookedRoomIds = await getBookedRoomIds(checkIn, checkOut);
  const isAvailable = !bookedRoomIds.includes(roomId.toString());
  console.log(`Room ${roomId} availability:`, isAvailable);

  return isAvailable;
}

/**
 * Tìm phòng trống theo tiêu chí.
 * @param {Object} query - Điều kiện tìm kiếm phòng.
 * @param {Date} checkIn - Ngày nhận phòng.
 * @param {Date} checkOut - Ngày trả phòng.
 * @param {Object} options - Tùy chọn (sort, skip, limit, minPrice, maxPrice).
 * @returns {Promise<Object[]>} Danh sách phòng trống.
 */
async function findAvailableRooms(query, checkIn, checkOut, options = {}) {
  const { sort = { discountedPrice: 1 }, skip = 0, limit = 10, minPrice, maxPrice } = options;

  console.log('findAvailableRooms - Query:', query);
  console.log('findAvailableRooms - Options:', options);

  // Lấy danh sách phòng đã đặt
  const bookedRoomIds = await getBookedRoomIds(checkIn, checkOut);
  query._id = { $nin: bookedRoomIds };
  query.status = 'available';

  // Xây dựng pipeline aggregation
  const pipeline = [
    { $match: query },
    {
      $lookup: {
        from: 'hotels',
        localField: 'hotelId',
        foreignField: '_id',
        as: 'hotelId'
      }
    },
    { $unwind: '$hotelId' },
    {
      $lookup: {
        from: 'amenities',
        localField: 'amenities',
        foreignField: '_id',
        as: 'amenities'
      }
    },
    {
      $addFields: {
        hasDiscount: {
          $cond: {
            if: {
              $and: [
                { $gt: ['$discountPercent', 0] },
                { $ne: ['$discountStartDate', null] },
                { $ne: ['$discountEndDate', null] },
                { $gte: [checkIn, '$discountStartDate'] },
                { $lte: [checkIn, '$discountEndDate'] }
              ]
            },
            then: true,
            else: false
          }
        },
        discountedPrice: {
          $cond: {
            if: {
              $and: [
                { $gt: ['$discountPercent', 0] },
                { $ne: ['$discountStartDate', null] },
                { $ne: ['$discountEndDate', null] },
                { $gte: [checkIn, '$discountStartDate'] },
                { $lte: [checkIn, '$discountEndDate'] }
              ]
            },
            then: {
              $round: [
                { $multiply: ['$price', { $subtract: [1, { $divide: ['$discountPercent', 100] }] }] },
                2
              ]
            },
            else: '$price'
          }
        },
        discountPercent: {
          $cond: {
            if: {
              $and: [
                { $gt: ['$discountPercent', 0] },
                { $ne: ['$discountStartDate', null] },
                { $ne: ['$discountEndDate', null] },
                { $gte: [checkIn, '$discountStartDate'] },
                { $lte: [checkIn, '$discountEndDate'] }
              ]
            },
            then: '$discountPercent',
            else: 0
          }
        }
      }
    }
  ];

  // Lọc theo giá
  if (minPrice || maxPrice) {
    pipeline.push({
      $match: {
        discountedPrice: {
          ...(minPrice && { $gte: Number(minPrice) }),
          ...(maxPrice && { $lte: Number(maxPrice) })
        }
      }
    });
  }

  // Sắp xếp, phân trang
  if (Object.keys(sort).length > 0) {
    pipeline.push({ $sort: sort });
  }
  pipeline.push(
    { $skip: skip },
    { $limit: limit }
  );

  const rooms = await Room.aggregate(pipeline);
  console.log('Available rooms:', rooms.map(room => ({ _id: room._id, hotelId: room.hotelId._id })));

  return rooms;
}

module.exports = { getBookedRoomIds, checkRoomAvailability, findAvailableRooms };