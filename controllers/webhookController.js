const mongoose = require('mongoose');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Amenity = require('../models/Amenity');
const Location = require('../models/Location');

async function searchHotels(req, res) {
  try {
    const {
      location,
      check_in_date,
      check_out_date,
      number_of_people,
      budget,
      amenities
    } = req.body.sessionInfo?.parameters || {};

    // Chuyển đổi check_in_date và check_out_date
    const checkInDateStr = check_in_date && typeof check_in_date === 'object'
      ? `${check_in_date.year}-${check_in_date.month.toString().padStart(2, '0')}-${check_in_date.day.toString().padStart(2, '0')}`
      : check_in_date;
    const checkOutDateStr = check_out_date && typeof check_out_date === 'object'
      ? `${check_out_date.year}-${check_out_date.month.toString().padStart(2, '0')}-${check_out_date.day.toString().padStart(2, '0')}`
      : check_out_date;

    // Kiểm tra tham số bắt buộc
    if (!location || !checkInDateStr || !checkOutDateStr || !number_of_people) {
      console.log('Missing required parameters:', { location, checkInDateStr, checkOutDateStr, number_of_people });
      return res.status(400).json({
        fulfillmentResponse: {
          messages: [
            {
              text: {
                text: ['Vui lòng cung cấp đầy đủ thông tin: địa điểm, ngày nhận phòng, ngày trả phòng, và số người.']
              }
            }
          ]
        }
      });
    }

    // Kiểm tra ngày hợp lệ
    const checkInDate = new Date(checkInDateStr);
    const checkOutDate = new Date(checkOutDateStr);
    if (isNaN(checkInDate) || isNaN(checkOutDate) || checkOutDate <= checkInDate) {
      console.log('Invalid date range:', { checkInDateStr, checkOutDateStr });
      return res.status(400).json({
        fulfillmentResponse: {
          messages: [
            {
              text: {
                text: ['Ngày trả phòng phải sau ngày nhận phòng.']
              }
            }
          ]
        }
      });
    }

    // Tìm locationId
    const locationDoc = await Location.findOne({ name: location, status: 'active' });
    if (!locationDoc) {
      console.log('Location not found:', { location });
      return res.status(200).json({
        fulfillmentResponse: {
          messages: [
            {
              text: {
                text: [`Không tìm thấy địa điểm ${location}. Vui lòng thử lại!`]
              }
            }
          ]
        }
      });
    }

    // Xây dựng query cho Room
    const roomQuery = {
      capacity: { $gte: parseInt(number_of_people) },
      status: 'available'
    };
    if (budget) {
      roomQuery.price = { $lte: parseInt(budget) };
    }

    // Xử lý amenities - FIX: Tìm ObjectId của amenities trước
    let amenityIds = [];
    if (amenities && Array.isArray(amenities) && amenities.length > 0) {
      const validAmenities = amenities.filter(amenity => typeof amenity === 'string' && amenity.trim() !== '');
      if (validAmenities.length === 0) {
        console.log('No valid amenities provided:', { amenities });
      } else {
        try {
          console.log('Querying Amenities with names:', { validAmenities });
          
          // Tìm amenities theo tên và lấy ObjectId
          const amenityDocs = await Amenity.find({ 
            name: { $in: validAmenities }, 
            type: 'room'
          }).select('_id name').lean();
          
          amenityIds = amenityDocs.map(doc => doc._id);
          console.log('Found amenities:', { amenityDocs, amenityIds });
          
          // Chỉ thêm điều kiện amenities nếu tìm thấy amenities hợp lệ
          if (amenityIds.length > 0) {
            roomQuery.amenities = { $all: amenityIds };
          } else {
            console.log('No matching amenities found for:', { validAmenities });
            // Không return lỗi ngay mà vẫn tiếp tục tìm kiếm không có điều kiện amenities
          }
        } catch (error) {
          console.error('Error querying amenities:', error.message, error.stack);
          // Không return lỗi ngay mà vẫn tiếp tục tìm kiếm không có điều kiện amenities
        }
      }
    }

    console.log('Final room query:', roomQuery);

    // Tìm các phòng phù hợp - không populate amenities ngay
    const rooms = await Room.find(roomQuery).lean();
      
    if (!rooms || rooms.length === 0) {
      console.log('No rooms found:', { roomQuery });
      
      // Nếu không tìm thấy phòng có amenities yêu cầu, thử tìm không có điều kiện amenities
      if (amenityIds.length > 0) {
        delete roomQuery.amenities;
        console.log('Retrying without amenities filter:', roomQuery);
        
        const roomsWithoutAmenities = await Room.find(roomQuery).lean();
          
        if (roomsWithoutAmenities && roomsWithoutAmenities.length > 0) {
          return res.status(200).json({
            fulfillmentResponse: {
              messages: [
                {
                  text: {
                    text: [`Không tìm thấy phòng có đủ tiện nghi yêu cầu. Tôi sẽ tìm các khách sạn phù hợp khác ở ${location}.`]
                  }
                }
              ]
            }
          });
        }
      }
      
      return res.status(404).json({
        fulfillmentResponse: {
          messages: [
            {
              text: {
                text: ['Không tìm thấy phòng phù hợp với yêu cầu của bạn.']
              }
            }
          ]
        }
      });
    }

    // Lấy danh sách hotelId
    const hotelIds = [...new Set(rooms.map(room => room.hotelId.toString()))];

    // Tìm khách sạn phù hợp
    const hotels = await Hotel.find({
      _id: { $in: hotelIds },
      locationId: locationDoc._id,
      status: 'active'
    })
      .populate('amenities', 'name')
      .limit(5)
      .lean();
      
    if (!hotels || hotels.length === 0) {
      console.log('No hotels found:', { hotelIds, locationId: locationDoc._id });
      return res.status(404).json({
        fulfillmentResponse: {
          messages: [
            {
              text: {
                text: ['Rất tiếc, không tìm thấy khách sạn phù hợp. Bạn muốn thay đổi tiêu chí tìm kiếm không?']
              }
            }
          ]
        }
      });
    }

    // Populate amenities cho rooms một cách an toàn
    const populatedRooms = [];
    for (const room of rooms) {
      try {
        if (room.amenities && room.amenities.length > 0) {
          // Lọc ra những ObjectId hợp lệ
          const validAmenityIds = room.amenities.filter(id => {
            return mongoose.Types.ObjectId.isValid(id);
          });
          
          if (validAmenityIds.length > 0) {
            const roomAmenities = await Amenity.find({
              _id: { $in: validAmenityIds }
            }).select('name').lean();
            
            populatedRooms.push({
              ...room,
              amenities: roomAmenities
            });
          } else {
            populatedRooms.push({
              ...room,
              amenities: []
            });
          }
        } else {
          populatedRooms.push({
            ...room,
            amenities: []
          });
        }
      } catch (error) {
        console.error('Error populating amenities for room:', room._id, error.message);
        populatedRooms.push({
          ...room,
          amenities: []
        });
      }
    }

    // Tính giá thấp nhất và tiện nghi
    const hotelResults = hotels.map(hotel => {
      const hotelRooms = populatedRooms.filter(room => room.hotelId.toString() === hotel._id.toString());
      const lowestPrice = Math.min(...hotelRooms.map(room => room.price));
      const hotelAmenities = hotel.amenities ? hotel.amenities.map(a => a.name) : [];
      const roomAmenities = [...new Set(hotelRooms.flatMap(room => 
        room.amenities ? room.amenities.map(a => a.name) : []
      ))];
      return {
        name: hotel.name,
        address: hotel.address,
        lowestPrice,
        rating: hotel.rating || 0,
        amenities: [...new Set([...hotelAmenities, ...roomAmenities])],
        description: hotel.description || 'Không có mô tả'
      };
    });

    // Tạo phản hồi
    const responseText = hotelResults.map((hotel, index) => {
      const amenitiesText = hotel.amenities.length > 0 ? hotel.amenities.join(', ') : 'Không có thông tin tiện nghi';
      return `${index + 1}. ${hotel.name} - ${hotel.lowestPrice.toLocaleString('vi-VN')} VNĐ/đêm, đánh giá: ${hotel.rating.toFixed(1)}/5, tiện nghi: ${amenitiesText}.`;
    }).join('\n');

    return res.status(200).json({
      fulfillmentResponse: {
        messages: [
          {
            text: {
              text: [`Tôi tìm thấy các khách sạn sau ở ${location}:\n${responseText}\nBạn muốn xem chi tiết khách sạn nào? (Chọn số hoặc tên).`]
            }
          }
        ]
      },
      sessionInfo: {
        parameters: {
          hotel_results: hotelResults
        }
      }
    });

  } catch (error) {
    console.error('Webhook error:', error.message, error.stack);
    return res.status(500).json({
      fulfillmentResponse: {
        messages: [
          {
            text: {
              text: ['Đã có lỗi xảy ra khi tìm kiếm khách sạn. Vui lòng thử lại sau!']
            }
          }
        ]
      }
    });
  }
}

module.exports = { searchHotels };
