const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Location = require('../models/Location');
const Amenity = require('../models/Amenity');
const Voucher = require('../models/Voucher');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Hàm xây dựng truy vấn MongoDB
async function buildQuery(params) {
  const query = { status: 'active' }; // Chỉ lấy khách sạn đang hoạt động

  // Lọc theo địa điểm
  if (params.location) {
    const location = await Location.findOne({ 
      name: { $regex: params.location, $options: 'i' }, 
      status: 'active' 
    });
    if (location) {
      query.locationId = location._id;
    } else {
      throw new Error('Không tìm thấy địa điểm');
    }
  }

  // Lọc theo giá
  if (params.price_min || params.price_max) {
    query.lowestPrice = {};
    if (params.price_min) query.lowestPrice.$gte = Number(params.price_min);
    if (params.price_max) query.lowestPrice.$lte = Number(params.price_max);
  }

  // Lọc theo tiện ích
  if (params.amenities && params.amenities.length) {
    const amenities = await Amenity.find({ 
      name: { $in: params.amenities }, 
      type: 'hotel' 
    });
    query.amenities = { $all: amenities.map(a => a._id) };
  }

  // Lọc theo đánh giá
  if (params.rating) {
    query.rating = { $gte: Number(params.rating) };
  }

  // Lọc theo chính sách (ví dụ: cho phép thú cưng)
  if (params.pet_policy) {
    query['policies.petPolicy'] = params.pet_policy;
  }

  return query;
}

// Hàm thực thi truy vấn
async function executeQuery(hotelQuery, params) {
  // Tìm khách sạn
  let hotels = await Hotel.find(hotelQuery)
    .populate('locationId', 'name')
    .populate('amenities', 'name')
    .limit(5) // Giới hạn tối đa 5 khách sạn
    .lean();

  // Lọc phòng nếu có tiêu chí phòng
  if (params.room_type || params.capacity || params.bed_type || params.room_amenities) {
    const roomQuery = { status: 'available' };

    if (params.room_type) roomQuery.roomType = params.room_type;
    if (params.capacity) roomQuery.capacity = { $gte: Number(params.capacity) };
    if (params.bed_type) roomQuery.bedType = params.bed_type;
    if (params.room_amenities && params.room_amenities.length) {
      const amenities = await Amenity.find({ 
        name: { $in: params.room_amenities }, 
        type: 'room' 
      });
      roomQuery.amenities = { $all: amenities.map(a => a._id) };
    }

    // Lấy phòng cho mỗi khách sạn
    hotels = await Promise.all(hotels.map(async (hotel) => {
      roomQuery.hotelId = hotel._id;
      const rooms = await Room.find(roomQuery)
        .populate('amenities', 'name')
        .lean();
      return { ...hotel, rooms };
    }));

    // Lọc khách sạn có phòng phù hợp
    hotels = hotels.filter(hotel => hotel.rooms && hotel.rooms.length > 0);
  }

  // Áp dụng voucher nếu có
  if (params.voucher_code) {
    const voucher = await Voucher.findOne({ 
      code: params.voucher_code, 
      status: 'active',
      expiryDate: { $gte: new Date() },
      $or: [{ usageLimit: null }, { usageCount: { $lt: '$usageLimit' } }]
    });
    if (voucher) {
      hotels = hotels.map(hotel => ({
        ...hotel,
        rooms: hotel.rooms ? hotel.rooms.map(room => ({
          ...room,
          discountedPrice: voucher.calculateDiscount(room.price)
        })) : []
      }));
    }
  }

  // Kiểm tra ngày (giả định phòng trống nếu status là available)
  if (params.check_in_date && params.check_out_date) {
    // Trong hệ thống thực tế, cần kiểm tra lịch đặt phòng
    hotels = hotels.filter(hotel => hotel.rooms && hotel.rooms.length > 0);
  }

  // Giới hạn 3-5 khách sạn
  return hotels.slice(0, Math.min(hotels.length, 5)).slice(-Math.max(3, Math.min(hotels.length, 5)));
}

// Hàm định dạng phản hồi
function formatResponse(hotels, params) {
  if (!hotels.length) {
    return {
      fulfillmentResponse: {
        messages: [{
          text: {
            text: ['Không tìm thấy khách sạn phù hợp với tiêu chí của bạn.']
          }
        }]
      }
    };
  }

  const messages = hotels.map(hotel => {
    let text = `${hotel.name} ở ${hotel.locationId.name}, Đánh giá: ${hotel.rating}/5`;
    if (hotel.rooms && hotel.rooms.length) {
      text += `\nPhòng trống: ${hotel.rooms.map(r => `${r.name} (${r.roomType}, ${r.discountedPrice ? r.discountedPrice : r.price} VNĐ)`).join(', ')}`;
    }
    text += `\nXem chi tiết: ${CLIENT_URL}/hoteldetail/${hotel._id}`;
    return text;
  });

  return {
    fulfillmentResponse: {
      messages: [{
        text: {
          text: [`Tìm thấy ${hotels.length} khách sạn:`, ...messages]
        }
      }]
    },
    sessionInfo: {
      parameters: params // Giữ tham số session
    }
  };
}

// Controller chính
exports.handleWebhook = async (req, res) => {
  const { sessionInfo } = req.body;
  const params = sessionInfo.parameters;

  try {
    const query = await buildQuery(params);
    const results = await executeQuery(query, params);
    const response = formatResponse(results, params);
    res.json(response);
  } catch (error) {
    console.error('Lỗi webhook:', error);
    res.json({
      fulfillmentResponse: {
        messages: [{
          text: {
            text: ['Xin lỗi, có lỗi xảy ra. Vui lòng thử lại.']
          }
        }]
      }
    });
  }
};
