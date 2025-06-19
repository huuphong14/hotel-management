const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const { ObjectId } = mongoose.Types;

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
 * @param {Object} options - Tùy chọn (sort, skip, limit, minPrice, maxPrice, locationId, minRating, maxRating, amenities).
 * @returns {Promise<Object[]>} Danh sách phòng trống.
 */
async function findAvailableRooms(query, checkIn, checkOut, options = {}) {
  const { sort = 'price', skip = 0, limit = 10, minPrice, maxPrice, locationId, minRating, maxRating, roomAmenities, hotelAmenities } = options;

  console.log('findAvailableRooms - Query:', query);
  console.log('findAvailableRooms - Options:', { ...options, roomAmenities, hotelAmenities });
  console.log('findAvailableRooms - Period:', { checkIn, checkOut });

  // 1. Lấy danh sách phòng đã đặt trong khoảng thời gian
  const bookedRoomIds = await getBookedRoomIds(checkIn, checkOut);

  // 2. Tạo query để tìm phòng available và không bị đặt
  const roomQuery = {
    ...query,
    _id: { $nin: bookedRoomIds.map(id => new mongoose.Types.ObjectId(id)) },
    status: 'available'
  };

  // Thêm điều kiện lọc amenities của phòng nếu có
  if (roomAmenities && roomAmenities.length > 0) {
    roomQuery.amenities = { $in: roomAmenities.map(id => new mongoose.Types.ObjectId(id)) };
  }

  console.log("Final roomQuery before aggregation:", roomQuery);

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
    }
  ];

  // Thêm điều kiện lọc theo location nếu có
  if (locationId) {
    pipeline.push({
      $match: {
        'hotelInfo.locationId': new mongoose.Types.ObjectId(locationId)
      }
    });
  }

  // Thêm điều kiện lọc theo amenities của khách sạn nếu có
  if (hotelAmenities && hotelAmenities.length > 0) {
    pipeline.push({
      $match: {
        'hotelInfo.amenities': { $in: hotelAmenities.map(id => new mongoose.Types.ObjectId(id)) }
      }
    });
  }

  // Tiếp tục pipeline
  pipeline.push(
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
        currentDiscountPercent: {
          $cond: {
            if: '$hasValidDiscount',
            then: '$discountPercent',
            else: 0
          }
        }
      }
    }
  );

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

  // 5. Chỉ lấy phòng từ khách sạn active và lọc theo rating nếu có
  const hotelMatch = {
    'hotelInfo.status': 'active'
  };

  if (minRating !== undefined || maxRating !== undefined) {
    hotelMatch['hotelInfo.rating'] = {};
    if (minRating !== undefined) hotelMatch['hotelInfo.rating'].$gte = Number(minRating);
    if (maxRating !== undefined) hotelMatch['hotelInfo.rating'].$lte = Number(maxRating);
  }

  pipeline.push({
    $match: hotelMatch
  });

  // 6. Nhóm theo khách sạn và tính toán thông tin
  pipeline.push({
    $group: {
      _id: '$hotelInfo._id',
      name: { $first: '$hotelInfo.name' },
      address: { $first: '$hotelInfo.address' },
      rating: { $first: '$hotelInfo.rating' },
      reviewCount: { $first: '$hotelInfo.reviewCount' },
      images: { $first: '$hotelInfo.images' },
      featuredImage: { $first: '$hotelInfo.featuredImage' },
      policies: { $first: '$hotelInfo.policies' },
      amenities: { $first: '$hotelInfo.amenities' }, 
      locationId: { $first: '$hotelInfo.locationId' },
      locationName: { $first: '$hotelInfo.locationName' },
      lowestPrice: { $min: '$discountedPrice' },
      lowestDiscountedPrice: { $min: '$discountedPrice' },
      highestDiscountPercent: { $max: '$currentDiscountPercent' },
      availableRoomCount: { $sum: 1 },
      availableRoomTypes: { $addToSet: '$roomType' },
      roomsWithAmenities: {
        $push: {
          roomId: '$_id',
          roomType: '$roomType', // Thêm roomType vào đây
          amenities: '$amenities._id'
        }
      }
    }
  });

  // 7. Sắp xếp theo tiêu chí
  if (sort) {
    let sortField = sort;
    if (typeof sort === 'string') {
      switch (sort) {
        case 'price':
          sortField = { lowestDiscountedPrice: 1 };
          break;
        case '-price':
          sortField = { lowestDiscountedPrice: -1 };
          break;
        case 'rating':
          sortField = { reviewCount: -1, rating: -1 };
          break;
        case '-rating':
          sortField = { reviewCount: -1, rating: 1 };
          break;
        case 'highestDiscountPercent':
          sortField = { highestDiscountPercent: 1 };
          break;
        case '-highestDiscountPercent':
          sortField = { highestDiscountPercent: -1 };
          break;
        default:
          sortField = { [sort.replace('-', '')]: sort.startsWith('-') ? -1 : 1 };
      }
    }
    pipeline.push({ $sort: sortField });
  }

  // 8. Phân trang
  pipeline.push(
    { $skip: skip },
    { $limit: limit }
  );

  // 9. Thực hiện query
  const hotels = await Room.aggregate(pipeline);

  console.log(`Found ${hotels.length} hotels with available rooms`);
  console.log('Hotels summary:', hotels.map(hotel => ({
    _id: hotel._id,
    name: hotel.name,
    rating: hotel.rating,
    availableRoomCount: hotel.availableRoomCount,
    availableRoomTypes: hotel.availableRoomTypes,
    lowestPrice: hotel.lowestPrice,
    highestDiscountPercent: hotel.highestDiscountPercent,
    hotelAmenities: hotel.amenities
  })));

  return hotels;
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

async function countAvailableHotels(query, checkIn, checkOut, options = {}) {
  const { minPrice, maxPrice, locationId, minRating, maxRating, roomAmenities, hotelAmenities } = options;

  // 1. Lấy danh sách phòng đã đặt trong khoảng thời gian
  const bookedRoomIds = await getBookedRoomIds(checkIn, checkOut);

  // 2. Tạo query để tìm phòng available và không bị đặt
  const roomQuery = {
    ...query,
    _id: { $nin: bookedRoomIds.map(id => new mongoose.Types.ObjectId(id)) },
    status: 'available'
  };

  // Thêm điều kiện lọc amenities của phòng nếu có
  if (roomAmenities && roomAmenities.length > 0) {
    roomQuery.amenities = { $in: roomAmenities.map(id => new mongoose.Types.ObjectId(id)) };
  }

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
    }
  ];

  // Thêm điều kiện lọc theo location nếu có
  if (locationId) {
    pipeline.push({
      $match: {
        'hotelInfo.locationId': new mongoose.Types.ObjectId(locationId)
      }
    });
  }

  // Thêm điều kiện lọc theo amenities của khách sạn nếu có
  if (hotelAmenities && hotelAmenities.length > 0) {
    pipeline.push({
      $match: {
        'hotelInfo.amenities': { $in: hotelAmenities.map(id => new mongoose.Types.ObjectId(id)) }
      }
    });
  }

  // Tiếp tục pipeline
  pipeline.push(
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
        }
      }
    }
  );

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

  // 5. Chỉ lấy phòng từ khách sạn active và lọc theo rating nếu có
  const hotelMatch = {
    'hotelInfo.status': 'active'
  };

  if (minRating !== undefined || maxRating !== undefined) {
    hotelMatch['hotelInfo.rating'] = {};
    if (minRating !== undefined) hotelMatch['hotelInfo.rating'].$gte = Number(minRating);
    if (maxRating !== undefined) hotelMatch['hotelInfo.rating'].$lte = Number(maxRating);
  }

  pipeline.push({
    $match: hotelMatch
  });

  // 6. Nhóm theo khách sạn và tính toán thông tin
  pipeline.push({
    $group: {
      _id: '$hotelInfo._id',
      roomsWithAmenities: {
        $push: {
          roomId: '$_id',
          amenities: '$amenities._id'
        }
      }
    }
  });

  // 7. Đếm tổng số khách sạn
  pipeline.push({
    $count: 'total'
  });

  const result = await Room.aggregate(pipeline);
  return result[0]?.total || 0;
}

async function getAvailableRoomsByHotel(hotelId, query, checkIn, checkOut, options = {}) {
  console.log('=== [START] getAvailableRoomsByHotel ===');
  console.log('Input params:', {
    hotelId,
    query,
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    options
  });

  const { sort = 'price', skip = 0, limit = 10, minPrice, maxPrice } = options;

  // 1. Lấy danh sách phòng đã đặt trong khoảng thời gian
  const bookedRoomIds = await getBookedRoomIds(checkIn, checkOut);
  console.log('Booked room IDs:', bookedRoomIds);

  // 2. Tìm tất cả phòng của khách sạn trước khi lọc
  const allRooms = await Room.find({ hotelId: new mongoose.Types.ObjectId(hotelId) });
  console.log(`Total rooms in hotel: ${allRooms.length}`);

  // Log thông tin từng phòng trước khi lọc
  allRooms.forEach(room => {
    console.log(`\nRoom ${room._id} initial state:`, {
      name: room.name,
      status: room.status,
      capacity: room.capacity,
      roomType: room.roomType,
      price: room.price,
      isBooked: bookedRoomIds.includes(room._id.toString()),
      amenities: room.amenities?.length || 0
    });
  });

  // 3. Tạo query để tìm phòng available và không bị đặt
  const roomQuery = {
    ...query,
    hotelId: new mongoose.Types.ObjectId(hotelId),
    _id: { $nin: bookedRoomIds.map(id => new mongoose.Types.ObjectId(id)) },
    status: 'available'
  };
  console.log('\nFinal room query:', JSON.stringify(roomQuery, null, 2));

  // 4. Kiểm tra từng điều kiện riêng lẻ
  const roomsAfterStatus = await Room.find({
    hotelId: new mongoose.Types.ObjectId(hotelId),
    status: 'available'
  });
  console.log(`\nRooms after status filter: ${roomsAfterStatus.length}`);
  roomsAfterStatus.forEach(room => {
    console.log(`Room ${room._id} passed status filter:`, {
      name: room.name,
      status: room.status
    });
  });

  const roomsAfterBooking = roomsAfterStatus.filter(room => !bookedRoomIds.includes(room._id.toString()));
  console.log(`\nRooms after booking filter: ${roomsAfterBooking.length}`);
  roomsAfterBooking.forEach(room => {
    console.log(`Room ${room._id} passed booking filter:`, {
      name: room.name,
      isBooked: false
    });
  });

  // Fix capacity filter
  const requiredCapacity = query.capacity?.$gte || 1; // Lấy giá trị từ $gte hoặc mặc định là 1
  const roomsAfterCapacity = roomsAfterBooking.filter(room => room.capacity >= requiredCapacity);
  console.log(`\nRooms after capacity filter (>=${requiredCapacity}): ${roomsAfterCapacity.length}`);
  roomsAfterBooking.forEach(room => {
    console.log(`Room ${room._id} capacity check:`, {
      name: room.name,
      capacity: room.capacity,
      requiredCapacity: requiredCapacity,
      passed: room.capacity >= requiredCapacity
    });
  });

  if (query.roomType) {
    const roomsAfterType = roomsAfterCapacity.filter(room => query.roomType.$in.includes(room.roomType));
    console.log(`\nRooms after room type filter: ${roomsAfterType.length}`);
    roomsAfterCapacity.forEach(room => {
      console.log(`Room ${room._id} room type check:`, {
        name: room.name,
        roomType: room.roomType,
        requiredTypes: query.roomType.$in,
        passed: query.roomType.$in.includes(room.roomType)
      });
    });
  }

  if (query.amenities) {
    console.log('\n=== Amenities Filter Details ===');
    console.log('Required amenities:', query.amenities.$in);

    // Lấy thông tin chi tiết của các amenities
    const amenitiesDetails = await mongoose.model('Amenity').find({
      _id: { $in: query.amenities.$in }
    });
    console.log('Required amenities details:', amenitiesDetails.map(a => ({
      id: a._id,
      name: a.name
    })));

    // Lấy thông tin chi tiết của amenities cho tất cả phòng
    const roomAmenitiesMap = new Map();
    for (const room of roomsAfterCapacity) {
      const roomAmenities = await mongoose.model('Amenity').find({
        _id: { $in: room.amenities }
      });
      roomAmenitiesMap.set(room._id.toString(), roomAmenities);
    }

    const roomsAfterAmenities = roomsAfterCapacity.filter(room => {
      console.log(`\nChecking amenities for room ${room._id} (${room.name}):`);

      const roomAmenities = roomAmenitiesMap.get(room._id.toString()) || [];
      console.log('Room amenities:', roomAmenities.map(a => ({
        id: a._id,
        name: a.name
      })));

      // Kiểm tra từng amenity yêu cầu
      const missingAmenities = [];
      const hasAllAmenities = query.amenities.$in.every(amenityId => {
        const hasAmenity = roomAmenities.some(roomAmenity =>
          roomAmenity._id.toString() === amenityId.toString()
        );

        const amenityDetail = amenitiesDetails.find(a => a._id.toString() === amenityId.toString());
        if (!hasAmenity) {
          missingAmenities.push({
            id: amenityId,
            name: amenityDetail ? amenityDetail.name : 'Unknown'
          });
        }

        console.log(`Checking amenity ${amenityDetail ? amenityDetail.name : amenityId}: ${hasAmenity ? '✓' : '✗'}`);
        return hasAmenity;
      });

      if (missingAmenities.length > 0) {
        console.log('Missing amenities:', missingAmenities);
      } else {
        console.log('Room has all required amenities ✓');
      }

      return hasAllAmenities;
    });

    console.log(`\nRooms after amenities filter: ${roomsAfterAmenities.length}`);
    console.log('Rooms that passed amenities filter:');
    roomsAfterAmenities.forEach(room => {
      const roomAmenities = roomAmenitiesMap.get(room._id.toString()) || [];
      console.log(`\nRoom ${room._id} (${room.name}):`, {
        amenities: roomAmenities.map(a => ({
          id: a._id,
          name: a.name
        }))
      });
    });

    console.log('\nRooms that failed amenities filter:');
    roomsAfterCapacity.filter(room => !roomsAfterAmenities.includes(room)).forEach(room => {
      const roomAmenities = roomAmenitiesMap.get(room._id.toString()) || [];
      const missingAmenities = query.amenities.$in
        .filter(amenityId => !roomAmenities.some(roomAmenity =>
          roomAmenity._id.toString() === amenityId.toString()
        ))
        .map(amenityId => {
          const amenity = amenitiesDetails.find(a => a._id.toString() === amenityId.toString());
          return {
            id: amenityId,
            name: amenity ? amenity.name : 'Unknown'
          };
        });

      console.log(`\nRoom ${room._id} (${room.name}):`, {
        hasAmenities: roomAmenities.map(a => ({
          id: a._id,
          name: a.name
        })),
        missingAmenities: missingAmenities
      });
    });
  }

  // 5. Xây dựng pipeline aggregation
  const pipeline = [
    // Match rooms by hotel ID and status
    {
      $match: {
        hotelId: new ObjectId(hotelId),
        status: 'available',
        _id: { $nin: bookedRoomIds.map(id => new ObjectId(id)) }
      }
    },
    // Add capacity filter if specified
    ...(query.capacity ? [{
      $match: {
        capacity: { $gte: query.capacity.$gte || 1 }
      }
    }] : []),
    // Add amenities filter if specified
    ...(query.amenities && query.amenities.$in ? [{
      $match: {
        amenities: { $in: query.amenities.$in.map(id => new ObjectId(id)) }
      }
    }] : []),
    // Add room type filter if specified
    ...(query.roomType && query.roomType.$in ? [{
      $match: {
        roomType: { $in: query.roomType.$in }
      }
    }] : []),
    // Lookup amenities details
    {
      $lookup: {
        from: 'amenities',
        localField: 'amenities',
        foreignField: '_id',
        as: 'amenitiesDetails'
      }
    },
    // Add price range filter if specified
    ...(minPrice || maxPrice ? [{
      $match: {
        price: {
          ...(minPrice && { $gte: Number(minPrice) }),
          ...(maxPrice && { $lte: Number(maxPrice) })
        }
      }
    }] : []),
    // Sort
    {
      $sort: {
        ...(sort === 'price' || sort === 'price-asc' ? { price: 1 } :
          sort === 'price-desc' ? { price: -1 } :
            sort === 'capacity' || sort === 'capacity-asc' ? { capacity: 1 } :
              sort === 'capacity-desc' ? { capacity: -1 } :
                { price: 1 }) // Default sort by price ascending
      }
    },
    // Paginate
    { $skip: skip },
    { $limit: limit }
  ];

  console.log('Executing aggregation pipeline...');
  console.log('Pipeline:', JSON.stringify(pipeline, null, 2));
  const rooms = await Room.aggregate(pipeline);
  console.log('Found', rooms.length, 'rooms after all filters');

  // Get total count without pagination
  const countPipeline = [...pipeline];
  countPipeline.splice(-2); // Remove skip and limit
  countPipeline.push({ $count: 'total' });

  const totalResult = await Room.aggregate(countPipeline);
  const total = totalResult[0]?.total || 0;
  console.log('Total rooms (without pagination):', total);

  console.log('=== [END] getAvailableRoomsByHotel ===');
  return {
    rooms,
    total,
    page: Math.floor(skip / limit) + 1,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

module.exports = {
  getBookedRoomIds,
  checkRoomAvailability,
  findAvailableRooms,
  checkMultipleRoomsAvailability,
  countAvailableHotels,
  getAvailableRoomsByHotel,
};