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

  // Kiểm tra booking có trùng thời gian
  // Trùng khi: booking.checkIn < checkOutTime AND booking.checkOut > checkInTime
  const bookedRooms = await Booking.find({
    status: { $in: ['pending', 'confirmed'] }, // Chỉ tính booking đang chờ xác nhận hoặc đã xác nhận
    $and: [
      { checkIn: { $lt: checkOutTime } }, // Booking bắt đầu trước khi ta checkout
      { checkOut: { $gt: checkInTime } }  // Booking kết thúc sau khi ta checkin
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
  // Validate input
  if (!mongoose.isValidObjectId(roomId)) {
    throw new Error('Invalid roomId');
  }
  if (!(checkIn instanceof Date) || !(checkOut instanceof Date) || isNaN(checkIn) || isNaN(checkOut)) {
    throw new Error('Invalid check-in or check-out date');
  }
  if (checkOut <= checkIn) {
    throw new Error('Check-out date must be after check-in date');
  }

  console.log(`Checking availability for room ${roomId} from ${checkIn.toISOString()} to ${checkOut.toISOString()}`);

  // 1. Kiểm tra phòng có tồn tại và ở trạng thái available
  const room = await Room.findById(roomId);
  if (!room) {
    console.log(`Room ${roomId} does not exist`);
    return false;
  }

  if (room.status !== 'available') {
    console.log(`Room ${roomId} is not available. Current status: ${room.status}`);
    return false;
  }

  // 2. Kiểm tra có booking trùng thời gian không
  const checkInTime = new Date(checkIn);
  checkInTime.setHours(14, 0, 0, 0);
  const checkOutTime = new Date(checkOut);
  checkOutTime.setHours(12, 0, 0, 0);

  const conflictingBookings = await Booking.find({
    room: roomId,
    status: { $in: ['pending', 'confirmed'] },
    $and: [
      { checkIn: { $lt: checkOutTime } },
      { checkOut: { $gt: checkInTime } }
    ]
  });

  const isAvailable = conflictingBookings.length === 0;
  
  if (!isAvailable) {
    console.log(`Room ${roomId} has ${conflictingBookings.length} conflicting bookings:`, 
      conflictingBookings.map(b => ({ 
        id: b._id, 
        checkIn: b.checkIn.toISOString(), 
        checkOut: b.checkOut.toISOString(),
        status: b.status
      }))
    );
  }

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
  console.log('findAvailableRooms - Period:', { checkIn, checkOut });

  // 1. Lấy danh sách phòng đã đặt trong khoảng thời gian
  const bookedRoomIds = await getBookedRoomIds(checkIn, checkOut);
  
  // 2. Tạo query để tìm phòng available và không bị đặt
  const roomQuery = {
    ...query,
    _id: { $nin: bookedRoomIds.map(id => new mongoose.Types.ObjectId(id)) },
    status: 'available' // Chỉ lấy phòng có trạng thái available
  };

  console.log('Final room query:', roomQuery);

  // 3. Xây dựng pipeline aggregation
  const pipeline = [
    { $match: roomQuery },
    {
      $lookup: {
        from: 'hotels',
        localField: 'hotelId',
        foreignField: '_id',
        as: 'hotelInfo'
      }
    },
    { 
      $unwind: {
        path: '$hotelInfo',
        preserveNullAndEmptyArrays: true
      }
    },
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
        // Kiểm tra có discount hợp lệ không
        hasValidDiscount: {
          $and: [
            { $gt: ['$discountPercent', 0] },
            { $ne: ['$discountStartDate', null] },
            { $ne: ['$discountEndDate', null] },
            { $lte: ['$discountStartDate', checkIn] },
            { $gte: ['$discountEndDate', checkIn] }
          ]
        }
      }
    },
    {
      $addFields: {
        // Tính giá sau discount
        discountedPrice: {
          $cond: {
            if: '$hasValidDiscount',
            then: {
              $round: [
                { 
                  $multiply: [
                    '$price', 
                    { $subtract: [1, { $divide: ['$discountPercent', 100] }] }
                  ] 
                },
                0
              ]
            },
            else: '$price'
          }
        },
        // Hiển thị discount percent thực tế
        currentDiscountPercent: {
          $cond: {
            if: '$hasValidDiscount',
            then: '$discountPercent',
            else: 0
          }
        },
        // Thêm thông tin khách sạn vào root level để dễ truy cập
        hotelId: '$hotelInfo'
      }
    }
  ];

  // 4. Lọc theo giá nếu có
  if (minPrice || maxPrice) {
    const priceFilter = {};
    if (minPrice) priceFilter.$gte = Number(minPrice);
    if (maxPrice) priceFilter.$lte = Number(maxPrice);
    
    pipeline.push({
      $match: {
        discountedPrice: priceFilter
      }
    });
  }

  // 5. Chỉ lấy phòng từ khách sạn active
  pipeline.push({
    $match: {
      'hotelId.status': 'active'
    }
  });

  // 6. Sắp xếp và phân trang
  if (Object.keys(sort).length > 0) {
    pipeline.push({ $sort: sort });
  }
  
  pipeline.push(
    { $skip: skip },
    { $limit: limit }
  );

  // 7. Thực hiện query
  const rooms = await Room.aggregate(pipeline);
  
  console.log(`Found ${rooms.length} available rooms`);
  console.log('Available rooms summary:', rooms.map(room => ({ 
    _id: room._id, 
    name: room.name,
    hotelName: room.hotelId?.name,
    status: room.status,
    price: room.price,
    discountedPrice: room.discountedPrice,
    hasDiscount: room.hasValidDiscount
  })));

  return rooms;
}

/**
 * Kiểm tra nhiều phòng cùng lúc
 * @param {string[]} roomIds - Danh sách ID phòng cần kiểm tra
 * @param {Date} checkIn - Ngày nhận phòng
 * @param {Date} checkOut - Ngày trả phòng
 * @returns {Promise<Object>} Object với key là roomId và value là boolean availability
 */
async function checkMultipleRoomsAvailability(roomIds, checkIn, checkOut) {
  const results = {};
  
  // Validate input
  if (!Array.isArray(roomIds) || roomIds.length === 0) {
    return results;
  }

  // Lấy danh sách phòng đã đặt
  const bookedRoomIds = await getBookedRoomIds(checkIn, checkOut);
  
  // Lấy thông tin tất cả phòng cần kiểm tra
  const rooms = await Room.find({
    _id: { $in: roomIds.map(id => new mongoose.Types.ObjectId(id)) }
  });

  // Kiểm tra từng phòng
  for (const roomId of roomIds) {
    const room = rooms.find(r => r._id.toString() === roomId);
    
    if (!room) {
      results[roomId] = false; // Phòng không tồn tại
    } else if (room.status !== 'available') {
      results[roomId] = false; // Phòng không ở trạng thái available
    } else if (bookedRoomIds.includes(roomId)) {
      results[roomId] = false; // Phòng đã được đặt
    } else {
      results[roomId] = true; // Phòng available
    }
  }

  return results;
}

module.exports = { 
  getBookedRoomIds, 
  checkRoomAvailability, 
  findAvailableRooms,
  checkMultipleRoomsAvailability 
};