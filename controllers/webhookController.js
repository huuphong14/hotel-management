const { validateVoucher } = require('../services/voucherService');
const { findAvailableRooms } = require('../services/roomService');
const Location = require('../models/Location');
const Amenity = require('../models/Amenity');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Hàm chuyển đổi {year, month, day} thành Date object
function parseDateObject(dateObj) {
  if (dateObj && typeof dateObj === 'object' && dateObj.year && dateObj.month && dateObj.day) {
    // Tạo Date object với giờ 00:00:00 theo múi giờ địa phương (+07:00)
    const date = new Date(dateObj.year, dateObj.month - 1, dateObj.day, 0, 0, 0);
    // Chuyển về UTC để lưu trữ
    return new Date(Date.UTC(dateObj.year, dateObj.month - 1, dateObj.day));
  }
  return null;
}
// Hàm chuyển đổi Date object thành chuỗi YYYY-MM-DD
function formatDateToString(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Hàm xử lý date-period, date và các trường hợp ngày tháng
function processDateInputs(params) {
  console.log('Input params for date processing:', JSON.stringify({
    date_period: params['date-period'],
    check_in_date: params.check_in_date,
    check_out_date: params.check_out_date,
    date: params.date
  }, null, 2));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Chuẩn hóa today theo UTC
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  
  let checkInDate = null;
  let checkOutDate = null;
  
  if (params['date-period']) {
    if (params['date-period'].startDate) {
      checkInDate = parseDateObject(params['date-period'].startDate);
    }
    if (params['date-period'].endDate) {
      checkOutDate = parseDateObject(params['date-period'].endDate);
    }
  }
  
  if (!checkInDate) {
    if (params.check_in_date) {
      checkInDate = new Date(params.check_in_date);
      if (isNaN(checkInDate.getTime())) {
        checkInDate = null;
      } else {
        // Chuẩn hóa về UTC
        checkInDate = new Date(Date.UTC(checkInDate.getUTCFullYear(), checkInDate.getUTCMonth(), checkInDate.getUTCDate()));
      }
    } else if (params.date) {
      if (typeof params.date === 'object') {
        checkInDate = parseDateObject(params.date);
      } else {
        checkInDate = new Date(params.date);
        if (isNaN(checkInDate.getTime())) {
          checkInDate = null;
        } else {
          checkInDate = new Date(Date.UTC(checkInDate.getUTCFullYear(), checkInDate.getUTCMonth(), checkInDate.getUTCDate()));
        }
      }
    }
  }
  
  if (!checkOutDate && params.check_out_date) {
    checkOutDate = new Date(params.check_out_date);
    if (isNaN(checkOutDate.getTime())) {
      checkOutDate = null;
    } else {
      checkOutDate = new Date(Date.UTC(checkOutDate.getUTCFullYear(), checkOutDate.getUTCMonth(), checkOutDate.getUTCDate()));
    }
  }
  
  if (!checkInDate) {
    checkInDate = today;
  }
  if (!checkOutDate) {
    checkOutDate = new Date(checkInDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  if (checkOutDate <= checkInDate) {
    checkOutDate = new Date(checkInDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  const result = {
    checkInDate: checkInDate,
    checkOutDate: checkOutDate,
    checkInString: formatDateToString(checkInDate) || formatDateToString(today),
    checkOutString: formatDateToString(checkOutDate) || formatDateToString(tomorrow)
  };
  
  console.log('Processed date result:', JSON.stringify(result, null, 2));
  return result;
}

// Hàm xử lý và phân loại tiện ích
async function processAmenities(amenityNames) {
  console.log('Processing amenities input:', amenityNames);
  
  if (!amenityNames) {
    console.log('No amenity names provided');
    return { roomAmenities: [], hotelAmenities: [] };
  }

  let amenityArray = [];
  if (typeof amenityNames === 'string') {
    amenityArray = [amenityNames];
  } else if (Array.isArray(amenityNames)) {
    amenityArray = amenityNames;
  } else {
    console.log('Invalid amenity format:', typeof amenityNames);
    return { roomAmenities: [], hotelAmenities: [] };
  }

  if (!amenityArray.length) {
    console.log('Empty amenity array');
    return { roomAmenities: [], hotelAmenities: [] };
  }

  try {
    const amenities = await Amenity.find({
      name: { 
        $in: amenityArray.map(name => new RegExp(`^${name}$`, 'i'))
      }
    });

    console.log('Found amenities from DB:', amenities.map(a => ({ name: a.name, type: a.type, id: a._id })));

    const roomAmenities = amenities.filter(a => a.type === 'room').map(a => a._id);
    const hotelAmenities = amenities.filter(a => a.type === 'hotel').map(a => a._id);

    console.log('Processed amenities result:', {
      input: amenityArray,
      roomAmenities: roomAmenities.map(id => id.toString()),
      hotelAmenities: hotelAmenities.map(id => id.toString())
    });

    return { roomAmenities, hotelAmenities };
  } catch (error) {
    console.error('Error processing amenities:', error);
    return { roomAmenities: [], hotelAmenities: [] };
  }
}

// Hàm xây dựng truy vấn phòng
async function buildRoomQuery(params, amenitiesResult) {
  const query = {};

  // Xử lý room_type dưới dạng chuỗi hoặc mảng, không đặt mặc định nếu không có
  if (params.room_type) {
    const roomTypes = Array.isArray(params.room_type) ? params.room_type : [params.room_type];
    query.roomType = { $in: roomTypes };
    console.log(`Room types included in query: ${roomTypes.join(', ')}`);
  } else {
    console.log('No room type specified, skipping room type filter');
  }

  if (params.capacity) {
    query.capacity = { $gte: Number(params.capacity) };
  } else {
    query.capacity = { $gte: 2 };
  }

  if (params.bed_type) {
    query.bedType = params.bed_type;
  }

  if (amenitiesResult && amenitiesResult.roomAmenities.length) {
    query.amenities = { $in: amenitiesResult.roomAmenities };
  }

  if (params.cancellation_policy) {
    query.cancellationPolicy = params.cancellation_policy;
  }

  console.log('Built room query:', JSON.stringify(query, null, 2));
  return query;
}

// Hàm xây dựng tùy chọn tìm kiếm
async function buildOptions(params, amenitiesResult) {
  const options = {
    sort: params.sort || 'price',
    skip: params.skip || 0,
    limit: 10,
  };

  if (!params.location) {
    const defaultLocation = await Location.findOne({ name: 'Hà Nội', status: 'active' });
    if (defaultLocation) {
      options.locationId = defaultLocation._id;
      params.location = 'Hà Nội';
    }
  } else {
    const location = await Location.findOne({ 
      name: { $regex: params.location, $options: 'i' }, 
      status: 'active' 
    });
    if (location) {
      options.locationId = location._id;
    } else {
      throw new Error('Không tìm thấy địa điểm');
    }
  }

  if (params.price_range) {
    const range = params.price_range.toLowerCase();
    if (range.includes('dưới')) {
      const max = parseFloat(range.match(/\d+/)[0]) * (range.includes('triệu') ? 1000000 : 1);
      options.maxPrice = max;
    } else if (range.includes('từ') && range.includes('đến')) {
      const [min, max] = range.match(/\d+/g).map(Number);
      const unit = range.includes('triệu') ? 1000000 : 1;
      options.minPrice = min * unit;
      options.maxPrice = max * unit;
    } else if (range.includes('rẻ')) {
      options.maxPrice = 1000000;
    }
  } else {
    options.maxPrice = 2000000;
  }

  if (amenitiesResult) {
    if (amenitiesResult.roomAmenities.length) {
      options.roomAmenities = amenitiesResult.roomAmenities;
    }
    if (amenitiesResult.hotelAmenities.length) {
      options.hotelAmenities = amenitiesResult.hotelAmenities;
    }
  }

  if (params.rating) {
    options.minRating = Number(params.rating);
  }

  if (params.discount) {
    const discount = params.discount.toLowerCase();
    if (discount.includes('%')) {
      const percent = parseFloat(discount.match(/\d+/)[0]);
      options.minDiscountPercent = percent;
    } else if (discount.includes('có') || discount.includes('with')) {
      options.minDiscountPercent = 1;
    }
  }

  console.log('Built options:', JSON.stringify(options, null, 2));
  return options;
}

// Hàm định dạng phản hồi
function formatResponse(hotels, params, dateInfo, amenitiesResult) {
  if (!hotels || !Array.isArray(hotels) || hotels.length === 0) {
    return {
      fulfillmentResponse: {
        messages: [{
          text: {
            text: ['Không tìm thấy khách sạn phù hợp. Bạn muốn thử loại phòng khác hoặc thay đổi tiêu chí không?']
          }
        }]
      },
      sessionInfo: { parameters: params }
    };
  }

  const limitedHotels = hotels.slice(0, Math.min(hotels.length, 5));
  const { checkInString, checkOutString } = dateInfo;
  const capacity = params.capacity || 2;
  // Sử dụng room_type từ params, không đặt mặc định ở đây
  const roomType = params.room_type 

  let roomAmenitiesQuery = '';
  let hotelAmenitiesQuery = '';
  if (amenitiesResult) {
    if (amenitiesResult.roomAmenities.length) {
      roomAmenitiesQuery = `&roomAmenities=${encodeURIComponent(amenitiesResult.roomAmenities.map(id => id.toString()).join(','))}`;
    }
    if (amenitiesResult.hotelAmenities.length) {
      hotelAmenitiesQuery = `&hotelAmenities=${encodeURIComponent(amenitiesResult.hotelAmenities.map(id => id.toString()).join(','))}`;
    }
  }

  let fullText = `Tìm thấy ${hotels.length} khách sạn tại ${params.location || 'Hà Nội'} có phòng:\n\n`;
  
  limitedHotels.forEach((hotel, index) => {
    const locationName = hotel.locationName || params.location || 'Unknown';
    fullText += `${index + 1}. ${hotel.name || 'Unknown'} ở ${locationName}\n`;
    fullText += `   📍 Địa chỉ: ${hotel.address || 'Không có thông tin địa chỉ'}\n`;
    fullText += `   ⭐ Đánh giá: ${hotel.rating || 0}/5\n`;
    
    if (hotel.availableRoomTypes && hotel.availableRoomTypes.length) {
      fullText += `   🏠 Phòng trống: ${hotel.availableRoomTypes.join(', ')} (${hotel.availableRoomCount} phòng)\n`;
      fullText += `   💰 Giá từ: ${(hotel.lowestPrice || 0).toLocaleString('vi-VN')} VNĐ\n`;
    }
    
    if (hotel.highestDiscountPercent > 0) {
      fullText += `   🎉 Giảm giá: ${hotel.highestDiscountPercent}%\n`;
    }
    
    if (hotel.voucherApplied) {
      fullText += `   🎫 Voucher: ${hotel.voucherApplied}\n`;
    }
    
    fullText += `   🔗 Chi tiết: ${CLIENT_URL}/hoteldetail/${hotel._id || '684192c2fdacd20a7ef833e2'}?checkIn=${checkInString}&checkOut=${checkOutString}&capacity=${capacity}&roomType=${encodeURIComponent(roomType)}${roomAmenitiesQuery}${hotelAmenitiesQuery}\n\n`;
  });

  fullText += 'Bạn muốn xem thêm hay thay đổi loại phòng không?';

  return {
    fulfillmentResponse: {
      messages: [{
        text: {
          text: [fullText]
        }
      }]
    },
    sessionInfo: { parameters: params }
  };
}

// Controller chính
exports.handleWebhook = async (req, res) => {
  const { sessionInfo, fulfillmentInfo, queryText } = req.body;
  let params = sessionInfo?.parameters || {};

  console.log('=== WEBHOOK REQUEST ===');
  console.log('Query:', queryText);
  console.log('Params received:', JSON.stringify(params, null, 2));

  if (fulfillmentInfo?.tag !== 'HotelSearchWebhook') {
    console.error('Invalid fulfillment tag:', fulfillmentInfo?.tag);
    return res.status(400).json({
      fulfillmentResponse: {
        messages: [{
          text: { text: ['Fulfillment tag không hợp lệ.'] }
        }]
      }
    });
  }

  const apiKey = req.headers['x-webhook-api-key'];
  if (apiKey !== process.env.WEBHOOK_API_KEY) {
    console.error('Invalid API key');
    return res.status(401).json({
      fulfillmentResponse: {
        messages: [{
          text: { text: ['Yêu cầu không được xác thực.'] }
        }]
      }
    });
  }

  try {
    const dateInfo = processDateInputs(params);
    let amenitiesResult = null;
    if (params.amenity) {
      amenitiesResult = await processAmenities(params.amenity);
    }

    const roomQuery = await buildRoomQuery(params, amenitiesResult);
    const options = await buildOptions(params, amenitiesResult);

    const hotels = await findAvailableRooms(roomQuery, dateInfo.checkInDate, dateInfo.checkOutDate, options);

    if (params.voucher_code) {
      const lowestPrice = hotels.length > 0 ? Math.min(...hotels.map(h => h.lowestPrice || 0)) : 0;
      const voucherResult = await validateVoucher(
        params.voucher_code,
        lowestPrice,
        dateInfo.checkInDate,
        params.user_tier || 'Bronze',
        params.user_id || null,
        new Date()
      );

      if (voucherResult.success && voucherResult.voucher) {
        hotels.forEach(hotel => {
          hotel.lowestDiscountedPrice = Math.max(0, (hotel.lowestPrice || 0) - voucherResult.discountAmount);
          hotel.voucherApplied = params.voucher_code;
        });
      } else if (!voucherResult.success) {
        hotels.push({
          _id: 'voucher_error',
          name: 'Thông báo về voucher',
          message: voucherResult.message
        });
      }
    }

    const response = formatResponse(hotels, params, dateInfo, amenitiesResult);
    console.log('=== WEBHOOK RESPONSE ===');
    console.log('Hotels found:', hotels.length);
    console.log('Response sent:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('Webhook error:', error);
    res.json({
      fulfillmentResponse: {
        messages: [{
          text: { text: ['Xin lỗi, có lỗi xảy ra: ' + error.message] }
        }]
      }
    });
  }
};