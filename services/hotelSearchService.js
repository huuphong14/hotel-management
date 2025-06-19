const { findAvailableRooms } = require('./roomService');
const { validateVoucher } = require('./voucherService');
const Location = require('../models/Location');
const Amenity = require('../models/Amenity');
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const RANDOM_RESPONSES = [
  'Tôi tìm được các khách sạn sau phù hợp với yêu cầu của bạn.',
  'Đây là các khách sạn đáp ứng yêu cầu của bạn.',
  'Bạn tham khảo các khách sạn sau nhé!',
  'Dưới đây là một số khách sạn phù hợp với tiêu chí bạn đưa ra.',
  'Các khách sạn sau đây có thể phù hợp với bạn.'
];

function parseDateObject(dateObj) {
  if (dateObj && typeof dateObj === 'object' && dateObj.year && dateObj.month && dateObj.day) {
    const date = new Date(dateObj.year, dateObj.month - 1, dateObj.day, 0, 0, 0);
    return new Date(Date.UTC(dateObj.year, dateObj.month - 1, dateObj.day));
  }
  return null;
}
function formatDateToString(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function processDateInputs(params) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
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
  return {
    checkInDate: checkInDate,
    checkOutDate: checkOutDate,
    checkInString: formatDateToString(checkInDate) || formatDateToString(today),
    checkOutString: formatDateToString(checkOutDate) || formatDateToString(tomorrow)
  };
}
async function processAmenities(amenityNames) {
  if (!amenityNames) {
    return { roomAmenities: [], hotelAmenities: [] };
  }
  let amenityArray = [];
  if (typeof amenityNames === 'string') {
    amenityArray = [amenityNames];
  } else if (Array.isArray(amenityNames)) {
    amenityArray = amenityNames;
  } else {
    return { roomAmenities: [], hotelAmenities: [] };
  }
  if (!amenityArray.length) {
    return { roomAmenities: [], hotelAmenities: [] };
  }
  try {
    const amenities = await Amenity.find({
      name: { $in: amenityArray.map(name => new RegExp(`^${name}$`, 'i')) }
    });
    const roomAmenities = amenities.filter(a => a.type === 'room').map(a => a._id);
    const hotelAmenities = amenities.filter(a => a.type === 'hotel').map(a => a._id);
    return { roomAmenities, hotelAmenities };
  } catch (error) {
    return { roomAmenities: [], hotelAmenities: [] };
  }
}
async function buildRoomQuery(params, amenitiesResult) {
  const query = {};
  if (params.room_type) {
    const roomTypes = Array.isArray(params.room_type) ? params.room_type : [params.room_type];
    query.roomType = { $in: roomTypes };
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
  return query;
}
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
    const location = await Location.findOne({ name: { $regex: params.location, $options: 'i' }, status: 'active' });
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
  return options;
}

function buildHotelCard(hotel, index, params, dateInfo, amenitiesResult) {
  const { checkInString, checkOutString } = dateInfo;
  const capacity = params.capacity || 2;
  const roomType = params.room_type || '';
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
  const roomTypeParam = roomType ? `&roomType=${encodeURIComponent(roomType)}` : '';
  return {
    type: 'card',
    title: `${index + 1}. ${hotel.name || 'Unknown'}`,
    subtitle: hotel.locationName || params.location || 'Unknown',
    text: [
      `📍 Địa chỉ: ${hotel.address || 'Không có thông tin địa chỉ'}`,
      `⭐ Đánh giá: ${hotel.rating || 0}/5`,
      hotel.availableRoomTypes && hotel.availableRoomTypes.length
        ? `🏠 Phòng trống: ${hotel.availableRoomTypes.join(', ')} (${hotel.availableRoomCount} phòng)`
        : '',
      hotel.lowestPrice ? `💰 Giá từ: ${(hotel.lowestPrice || 0).toLocaleString('vi-VN')} VNĐ` : '',
      hotel.highestDiscountPercent > 0 ? `🎉 Giảm giá: ${hotel.highestDiscountPercent}%` : '',
      hotel.voucherApplied ? `🎫 Voucher: ${hotel.voucherApplied}` : ''
    ].filter(Boolean),
    button: {
      text: 'Xem chi tiết',
      link: `${CLIENT_URL}/hoteldetail/${hotel._id || '684192c2fdacd20a7ef833e2'}?checkIn=${checkInString}&checkOut=${checkOutString}&capacity=${capacity}${roomTypeParam}${roomAmenitiesQuery}${hotelAmenitiesQuery}`
    }
  };
}

function buildAdditionalData(hotels, params, dateInfo, amenitiesResult) {
  const roomType = params.room_type || '';
  const roomTypeParam = roomType ? `&roomType=${encodeURIComponent(roomType)}` : '';
  return {
    totalHotels: hotels.length,
    location: params.location || 'Hà Nội',
    checkInDate: dateInfo.checkInString,
    checkOutDate: dateInfo.checkOutString,
    hotels: hotels.map(hotel => ({
      id: hotel._id,
      name: hotel.name,
      location: hotel.locationName || params.location || 'Unknown',
      address: hotel.address,
      rating: hotel.rating,
      availableRoomTypes: hotel.availableRoomTypes ? hotel.availableRoomTypes.join(', ') : '',
      availableRoomCount: hotel.availableRoomCount,
      lowestPrice: hotel.lowestPrice ? hotel.lowestPrice.toLocaleString('vi-VN') : '',
      highestDiscountPercent: hotel.highestDiscountPercent,
      voucherApplied: hotel.voucherApplied || null,
      detailLink: `${CLIENT_URL}/hoteldetail/${hotel._id || '684192c2fdacd20a7ef833e2'}?checkIn=${dateInfo.checkInString}&checkOut=${dateInfo.checkOutString}&capacity=${params.capacity || 2}${roomTypeParam}`
    }))
  };
}

function normalizeDialogflowParams(params) {
  if (!params || typeof params !== 'object') return params;
  // Nếu là Dialogflow CX fields
  if (params.fields) {
    return Object.fromEntries(
      Object.entries(params.fields).map(([k, v]) => [k, normalizeDialogflowParams(v)])
    );
  }
  // Nếu là object kiểu { stringValue: ... }
  if ('stringValue' in params) return params.stringValue;
  if ('numberValue' in params) return params.numberValue;
  if ('boolValue' in params) return params.boolValue;
  if ('listValue' in params && Array.isArray(params.listValue)) {
    return params.listValue.map(normalizeDialogflowParams);
  }
  if ('structValue' in params) {
    return normalizeDialogflowParams(params.structValue);
  }
  // Nếu là object thường
  if (typeof params === 'object') {
    return Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, normalizeDialogflowParams(v)])
    );
  }
  return params;
}

function getRandomSubset(arr, n) {
  if (!Array.isArray(arr) || arr.length <= n) return arr;
  const result = [];
  const used = new Set();
  while (result.length < n) {
    const idx = Math.floor(Math.random() * arr.length);
    if (!used.has(idx)) {
      result.push(arr[idx]);
      used.add(idx);
    }
  }
  return result;
}

function getRandomResponseText() {
  return RANDOM_RESPONSES[Math.floor(Math.random() * RANDOM_RESPONSES.length)];
}

async function formatHotelSearchResponse(params) {
  params = normalizeDialogflowParams(params);
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
  // Build responseText
  let responseText = '';
  if (!hotels || !Array.isArray(hotels) || hotels.length === 0) {
    responseText = 'Không tìm thấy khách sạn phù hợp. Bạn muốn thử loại phòng khác hoặc thay đổi tiêu chí không?';
  } else {
    responseText = getRandomResponseText();
  }
  // Lấy ngẫu nhiên 5 khách sạn nếu nhiều hơn 5
  const limitedHotels = getRandomSubset(hotels, 5);
  const richContent = limitedHotels.map((hotel, idx) => buildHotelCard(hotel, idx, params, dateInfo, amenitiesResult));
  // Build additionalData
  const additionalData = buildAdditionalData(limitedHotels, params, dateInfo, amenitiesResult);
  return {
    responseText,
    richContent,
    additionalData
  };
}

module.exports = {
  parseDateObject,
  formatDateToString,
  processDateInputs,
  processAmenities,
  buildRoomQuery,
  buildOptions,
  formatHotelSearchResponse
}; 