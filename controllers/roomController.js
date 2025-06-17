const Room = require("../models/Room");
const Hotel = require("../models/Hotel");
const Booking = require("../models/Booking");
const Location = require("../models/Location");
const Amenity = require("../models/Amenity");
const cloudinaryService = require("../config/cloudinaryService");
const RoomService = require("../services/roomService");
const { updateHotelLowestPrice } = require("../utils/hotelHelpers");
const mongoose = require("mongoose");

/**
 * @swagger
 * /api/partner/rooms:
 *   get:
 *     summary: "Lấy danh sách phòng của partner"
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: "Tên phòng (tìm kiếm gần đúng)"
 *       - in: query
 *         name: floor
 *         schema:
 *           type: number
 *         description: "Tầng của phòng"
 *       - in: query
 *         name: bedType
 *         schema:
 *           type: string
 *           enum: [Single, Double, Twin, King, Queen]
 *         description: "Loại giường"
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: "Giá tối thiểu"
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: "Giá tối đa"
 *       - in: query
 *         name: capacity
 *         schema:
 *           type: number
 *         description: "Sức chứa"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [available, maintenance]
 *         description: "Trạng thái phòng"
 *       - in: query
 *         name: roomType
 *         schema:
 *           type: string
 *           enum: [Standard, Superior, Deluxe, Suite, Family]
 *         description: "Loại phòng"
 *       - in: query
 *         name: amenities
 *         schema:
 *           type: string
 *         description: "Danh sách ID tiện ích (JSON array)"
 *       - in: query
 *         name: hasDiscount
 *         schema:
 *           type: boolean
 *         description: "Lọc phòng có giảm giá"
 *       - in: query
 *         name: isBooked
 *         schema:
 *           type: boolean
 *         description: "Lọc phòng đang được đặt (true) hoặc không được đặt (false)"
 *       - in: query
 *         name: checkIn
 *         schema:
 *           type: string
 *           format: date
 *         description: "Ngày nhận phòng để kiểm tra trạng thái đặt phòng"
 *       - in: query
 *         name: checkOut
 *         schema:
 *           type: string
 *           format: date
 *         description: "Ngày trả phòng để kiểm tra trạng thái đặt phòng"
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: "Sắp xếp (price, -price, capacity, -capacity, etc.)"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: "Trang"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: "Số lượng mỗi trang"
 *     responses:
 *       200:
 *         description: "Lấy danh sách phòng thành công"
 *       400:
 *         description: "Dữ liệu không hợp lệ"
 *       403:
 *         description: "Không có quyền truy cập"
 *       500:
 *         description: "Lỗi server"
 */
exports.getPartnerRooms = async (req, res) => {
  try {
    console.log("=== [START] getPartnerRooms ===");
    console.log("User ID:", req.user.id, "Role:", req.user.role);
    console.log("Query params:", req.query);

    // Kiểm tra vai trò partner
    if (req.user.role !== "partner") {
      console.log("Access denied: User is not a partner");
      return res.status(403).json({
        success: false,
        message: "Chỉ partner mới có quyền truy cập danh sách phòng",
      });
    }

    const {
      name,
      floor,
      bedType,
      minPrice,
      maxPrice,
      capacity,
      status,
      roomType,
      amenities,
      hasDiscount,
      isBooked,
      checkIn,
      checkOut,
      sort = "-createdAt",
      page = 1,
      limit = 10,
    } = req.query;

    // Tìm tất cả khách sạn thuộc sở hữu của partner
    const hotels = await Hotel.find({ ownerId: req.user.id }).select("_id name");
    const hotelIds = hotels.map((hotel) => hotel._id);
    console.log("Hotels owned by partner:", hotels.map(h => ({ id: h._id.toString(), name: h.name })));

    if (!hotelIds.length) {
      console.log("No hotels found for partner");
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        pagination: {
          currentPage: Number(page),
          totalPages: 0,
        },
        data: [],
      });
    }

    // Lấy tất cả phòng của các khách sạn trước khi lọc
    const allRooms = await Room.find({ hotelId: { $in: hotelIds } }).select("_id name floor bedType price capacity status roomType amenities discountPercent discountStartDate discountEndDate");
    console.log(`Total rooms before filtering: ${allRooms.length}`);
    allRooms.forEach(room => {
      console.log(`Room ${room._id} initial state:`, {
        name: room.name,
        floor: room.floor,
        bedType: room.bedType,
        price: room.price,
        capacity: room.capacity,
        status: room.status,
        roomType: room.roomType,
        amenities: room.amenities?.map(id => id.toString()) || [],
        hasDiscount: room.discountPercent > 0 && room.discountStartDate && room.discountEndDate
      });
    });

    // Xây dựng query
    const query = { hotelId: { $in: hotelIds } };

    // Lọc theo tên phòng
    if (name) {
      query.name = { $regex: name, $options: "i" };
      console.log("Name filter applied:", query.name);

      const roomsAfterName = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name");
      console.log(`Rooms after name filter: ${roomsAfterName.length}`);
      const filteredOutByName = allRooms.filter(room => !roomsAfterName.some(r => r._id.equals(room._id)));
      filteredOutByName.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by name:`, {
          roomName: room.name,
          requiredName: name
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterName);
    }

    // Lọc theo tầng
    if (floor) {
      query.floor = Number(floor);
      console.log("Floor filter applied:", query.floor);

      const roomsAfterFloor = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name floor");
      console.log(`Rooms after floor filter: ${roomsAfterFloor.length}`);
      const filteredOutByFloor = allRooms.filter(room => !roomsAfterFloor.some(r => r._id.equals(room._id)));
      filteredOutByFloor.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by floor:`, {
          roomFloor: room.floor,
          requiredFloor: floor
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterFloor);
    }

    // Lọc theo loại giường
    if (bedType) {
      query.bedType = bedType;
      console.log("Bed type filter applied:", query.bedType);

      const roomsAfterBedType = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name bedType");
      console.log(`Rooms after bed type filter: ${roomsAfterBedType.length}`);
      const filteredOutByBedType = allRooms.filter(room => !roomsAfterBedType.some(r => r._id.equals(room._id)));
      filteredOutByBedType.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by bed type:`, {
          roomBedType: room.bedType,
          requiredBedType: bedType
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterBedType);
    }

    // Lọc theo giá
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
      console.log("Price filter applied:", query.price);

      const roomsAfterPrice = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name price");
      console.log(`Rooms after price filter: ${roomsAfterPrice.length}`);
      const filteredOutByPrice = allRooms.filter(room => !roomsAfterPrice.some(r => r._id.equals(room._id)));
      filteredOutByPrice.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by price:`, {
          roomPrice: room.price,
          minPrice: minPrice || "N/A",
          maxPrice: maxPrice || "N/A"
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterPrice);
    }

    // Lọc theo sức chứa
    if (capacity) {
      query.capacity = Number(capacity);
      console.log("Capacity filter applied:", query.capacity);

      const roomsAfterCapacity = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name capacity");
      console.log(`Rooms after capacity filter: ${roomsAfterCapacity.length}`);
      const filteredOutByCapacity = allRooms.filter(room => !roomsAfterCapacity.some(r => r._id.equals(room._id)));
      filteredOutByCapacity.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by capacity:`, {
          roomCapacity: room.capacity,
          requiredCapacity: capacity
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterCapacity);
    }

    // Lọc theo trạng thái
    if (status) {
      query.status = status;
      console.log("Status filter applied:", query.status);

      const roomsAfterStatus = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name status");
      console.log(`Rooms after status filter: ${roomsAfterStatus.length}`);
      const filteredOutByStatus = allRooms.filter(room => !roomsAfterStatus.some(r => r._id.equals(room._id)));
      filteredOutByStatus.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by status:`, {
          roomStatus: room.status,
          requiredStatus: status
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterStatus);
    }

    // Lọc theo loại phòng
    if (roomType) {
      query.roomType = roomType;
      console.log("Room type filter applied:", query.roomType);

      const roomsAfterRoomType = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name roomType");
      console.log(`Rooms after room type filter: ${roomsAfterRoomType.length}`);
      const filteredOutByRoomType = allRooms.filter(room => !roomsAfterRoomType.some(r => r._id.equals(room._id)));
      filteredOutByRoomType.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by room type:`, {
          roomType: room.roomType,
          requiredRoomType: roomType
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterRoomType);
    }

    // Lọc theo tiện ích
    if (amenities) {
      try {
        const amenityIds = JSON.parse(amenities);
        const validAmenities = await Amenity.find({
          _id: { $in: amenityIds },
          type: "room",
        });
        if (validAmenities.length !== amenityIds.length) {
          console.log("Invalid amenities detected:", amenityIds);
          return res.status(400).json({
            success: false,
            message: "Một số tiện ích phòng không hợp lệ hoặc không tồn tại",
          });
        }
        query.amenities = { $all: amenityIds };
        console.log("Amenities filter applied:", amenityIds);

        const roomsAfterAmenities = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name amenities");
        console.log(`Rooms after amenities filter: ${roomsAfterAmenities.length}`);
        const filteredOutByAmenities = allRooms.filter(room => !roomsAfterAmenities.some(r => r._id.equals(room._id)));
        filteredOutByAmenities.forEach(async (room) => {
          const roomAmenities = await Amenity.find({ _id: { $in: room.amenities } }).select("name");
          const missingAmenities = amenityIds.filter(id => !room.amenities.some(a => a.toString() === id));
          console.log(`Room ${room._id} (${room.name}) filtered out by amenities:`, {
            roomAmenities: roomAmenities.map(a => a.name),
            requiredAmenities: (await Amenity.find({ _id: { $in: amenityIds } }).select("name")).map(a => a.name),
            missingAmenities: (await Amenity.find({ _id: { $in: missingAmenities } }).select("name")).map(a => a.name)
          });
        });
        allRooms.splice(0, allRooms.length, ...roomsAfterAmenities);
      } catch (error) {
        console.error("Amenities parsing error:", error.message);
        return res.status(400).json({
          success: false,
          message: "Định dạng tiện ích không hợp lệ",
          error: error.message,
        });
      }
    }

    // Lọc theo phòng có giảm giá
    if (hasDiscount === "true") {
      query.discountPercent = { $gt: 0 };
      query.discountStartDate = { $ne: null };
      query.discountEndDate = { $ne: null };
      console.log("Discount filter applied:", { discountPercent: query.discountPercent, discountStartDate: query.discountStartDate, discountEndDate: query.discountEndDate });

      const roomsAfterDiscount = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name discountPercent discountStartDate discountEndDate");
      console.log(`Rooms after discount filter: ${roomsAfterDiscount.length}`);
      const filteredOutByDiscount = allRooms.filter(room => !roomsAfterDiscount.some(r => r._id.equals(room._id)));
      filteredOutByDiscount.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by discount:`, {
          discountPercent: room.discountPercent,
          discountStartDate: room.discountStartDate,
          discountEndDate: room.discountEndDate
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterDiscount);
    }

    // Lọc theo trạng thái đặt phòng
    let bookedRoomIds = [];
    if (isBooked !== undefined || checkIn || checkOut) {
      if (checkIn && checkOut) {
        // Kiểm tra ngày hợp lệ
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        if (isNaN(checkInDate) || isNaN(checkOutDate)) {
          console.log("Invalid date format:", { checkIn, checkOut });
          return res.status(400).json({
            success: false,
            message: "Ngày nhận phòng hoặc trả phòng không hợp lệ",
          });
        }
        if (checkOutDate <= checkInDate) {
          console.log("Invalid date range:", { checkIn: checkInDate, checkOut: checkOutDate });
          return res.status(400).json({
            success: false,
            message: "Ngày trả phòng phải sau ngày nhận phòng",
          });
        }
        // Lấy danh sách phòng đã đặt trong khoảng thời gian
        bookedRoomIds = await RoomService.getBookedRoomIds(checkInDate, checkOutDate);
        console.log("Booked rooms in time range:", bookedRoomIds);
      } else if (isBooked !== undefined) {
        // Lấy tất cả phòng có booking ở trạng thái pending hoặc confirmed
        bookedRoomIds = await Booking.find({
          status: { $in: ["pending", "confirmed", "completed"] },
          room: { $in: await Room.find({ hotelId: { $in: hotelIds } }).distinct("_id") },
        }).distinct("room");
        bookedRoomIds = bookedRoomIds.map((id) => id.toString());
        console.log("Booked rooms (all time):", bookedRoomIds);
      }

      // Áp dụng bộ lọc isBooked
      if (isBooked === "true") {
        query._id = { $in: bookedRoomIds.map((id) => new mongoose.Types.ObjectId(id)) };
        console.log("Booked filter applied (isBooked=true):", query._id.$in.map(id => id.toString()));
      } else if (isBooked === "false") {
        query._id = { $nin: bookedRoomIds.map((id) => new mongoose.Types.ObjectId(id)) };
        console.log("Not booked filter applied (isBooked=false):", query._id.$nin.map(id => id.toString()));
      }

      const roomsAfterBooking = await Room.find({ ...query, hotelId: { $in: hotelIds } }).select("_id name");
      console.log(`Rooms after booking filter: ${roomsAfterBooking.length}`);
      const filteredOutByBooking = allRooms.filter(room => !roomsAfterBooking.some(r => r._id.equals(room._id)));
      filteredOutByBooking.forEach(room => {
        console.log(`Room ${room._id} (${room.name}) filtered out by booking status:`, {
          isBooked: isBooked === "true" ? "Required booked but not booked" : "Required not booked but booked",
          bookedRoomIds: bookedRoomIds.includes(room._id.toString())
        });
      });
      allRooms.splice(0, allRooms.length, ...roomsAfterBooking);
    }

    // Phân trang
    const skip = (Number(page) - 1) * Number(limit);
    console.log("Pagination applied:", { page, limit, skip });

    // Thực hiện query
    console.log("Final query:", JSON.stringify(query, null, 2));
    let rooms = await Room.find(query)
      .populate({
        path: "hotelId",
        select: "name address rating",
      })
      .populate({
        path: "amenities",
        select: "name icon description type",
      })
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    const total = await Room.countDocuments(query);
    console.log(`Final rooms before adding isBooked: ${rooms.length}, Total matching rooms: ${total}`);

    // Thêm trạng thái isBooked cho mỗi phòng
    if (checkIn && checkOut) {
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      rooms = await Promise.all(rooms.map(async (room) => {
        const isRoomBooked = await Booking.exists({
          room: room._id,
          status: { $in: ["pending", "confirmed"] },
          $or: [
            { checkIn: { $lte: checkOutDate }, checkOut: { $gte: checkInDate } },
          ],
        });
        return { ...room.toObject(), isBooked: !!isRoomBooked };
      }));
    } else {
      rooms = rooms.map(room => ({ ...room.toObject(), isBooked: bookedRoomIds.includes(room._id.toString()) }));
    }

    console.log(`Final rooms returned: ${rooms.length}`);
    rooms.forEach(room => {
      console.log(`Room ${room._id} included in final result:`, {
        name: room.name,
        floor: room.floor,
        bedType: room.bedType,
        price: room.price,
        capacity: room.capacity,
        status: room.status,
        roomType: room.roomType,
        amenities: room.amenities.map(a => a.name),
        hasDiscount: room.discountPercent > 0,
        isBooked: room.isBooked
      });
    });

    console.log("=== [END] getPartnerRooms ===");
    res.status(200).json({
      success: true,
      count: rooms.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      data: rooms,
    });
  } catch (error) {
    console.error("Get partner rooms error:", {
      message: error.message,
      stack: error.stack,
    });
    console.log("=== [END] getPartnerRooms with error ===");
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/hotels/{hotelId}/rooms:
 *   post:
 *     summary: "Tạo phòng mới cho khách sạn"
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID khách sạn"  
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - capacity
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               capacity:
 *                 type: number
 *               amenities:
 *                 type: string
 *                 description: "JSON array các ID tiện ích"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: "Tạo phòng thành công"
 *       400:
 *         description: "Dữ liệu không hợp lệ"
 *       403:
 *         description: "Không có quyền thêm phòng"
 *       404:
 *         description: "Không tìm thấy khách sạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.createRoom = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.hotelId);
    if (!hotel) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy khách sạn" });
    }

    if (hotel.ownerId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Bạn không có quyền thêm phòng" });
    }

    const amenities = req.body.amenities ? JSON.parse(req.body.amenities) : [];
    if (amenities.length > 0) {
      const validAmenities = await Amenity.find({
        _id: { $in: amenities },
        type: "room",
      });
      if (validAmenities.length !== amenities.length) {
        return res.status(400).json({
          success: false,
          message: "Một số tiện ích phòng không hợp lệ hoặc không tồn tại",
        });
      }
    }

    let images = [];
    if (req.files && req.files.length > 0) {
      images = await cloudinaryService.uploadManyFromBuffer(req.files, "rooms");
    }

    req.body.hotelId = req.params.hotelId;
    req.body.amenities = amenities;
    req.body.images = images;

    const room = await Room.create(req.body);
    await updateHotelLowestPrice(req.params.hotelId);

    res.status(201).json({ success: true, data: room });
  } catch (error) {
    console.error("Create room error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/rooms/{id}:
 *   get:
 *     summary: "Lấy thông tin chi tiết một phòng"
 *     tags: [Room]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID phòng"
 *     responses:
 *       200:
 *         description: "Lấy thông tin phòng thành công"
 *       404:
 *         description: "Không tìm thấy phòng"
 *       500:
 *         description: "Lỗi server"
 */
exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate({
        path: "hotelId",
        select: "name address rating images contact",
      })
      .populate({
        path: "amenities",
        select: "name icon description type",
      });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    res.status(200).json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error("Get room error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/hotels/{hotelId}/rooms:
 *   get:
 *     summary: "Lấy danh sách phòng của khách sạn"
 *     tags: [Room]
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID khách sạn"
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: "Giá tối thiểu"
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: "Giá tối đa"
 *       - in: query
 *         name: capacity
 *         schema:
 *           type: number
 *         description: "Sức chứa"
 *       - in: query
 *         name: available
 *         schema:
 *           type: string
 *         description: "Lọc phòng còn trống"
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: "Sắp xếp"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: "Trang"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: "Số lượng mỗi trang"    
 *     responses:
 *       200:
 *         description: "Lấy danh sách phòng thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getRooms = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const {
      minPrice,
      maxPrice,
      capacity,
      available,
      sort = "-createdAt",
      page = 1,
      limit = 10,
    } = req.query;

    const query = { hotelId };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (capacity) {
      query.capacity = Number(capacity);
    }
    if (available === "true") {
      query.status = "available";
    }

    const skip = (Number(page) - 1) * Number(limit);
    const rooms = await Room.find(query)
      .populate({
        path: "hotelId",
        select: "name address rating",
      })
      .populate({
        path: "amenities",
        select: "name icon description type",
      })
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    const total = await Room.countDocuments(query);

    res.status(200).json({
      success: true,
      count: rooms.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      data: rooms,
    });
  } catch (error) {
    console.error("Get rooms error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/rooms/{id}:
 *   put:
 *     summary: "Cập nhật thông tin phòng"
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID phòng"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               capacity:
 *                 type: number
 *               amenities:
 *                 type: string
 *                 description: "JSON array các ID tiện ích"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               imageAction:
 *                 type: string
 *                 enum: [add, replace]
 *                 description: "Thao tác với ảnh"
 *               removeImages:
 *                 type: string
 *                 enum: ['true']
 *                 description: "Xóa toàn bộ ảnh"
 *               removeImageIds:
 *                 type: string
 *                 description: "Danh sách ID ảnh cần xóa (dạng JSON hoặc chuỗi cách nhau bởi dấu phẩy)"
 *               removeDiscount:
 *                 type: string
 *                 enum: ['true']
 *                 description: "Hủy giảm giá phòng"
 *     responses:
 *       200:
 *         description: "Cập nhật phòng thành công"
 *       403:
 *         description: "Không có quyền cập nhật phòng"
 *       404:
*         description: "Không tìm thấy phòng"
 *       500:
 *         description: "Lỗi server"
 */
exports.updateRoom = async (req, res) => {
  try {
    let room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    const hotel = await Hotel.findById(room.hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin khách sạn",
      });
    }

    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật phòng này",
      });
    }

    const allowedFields = [
      "name",
      "description",
      "floor",
      "roomType",
      "bedType",
      "price",
      "capacity",
      "squareMeters",
      "amenities",
      "cancellationPolicy",
      "status",
      "discountPercent",
      "discountStartDate",
      "discountEndDate",
    ];

    const updateData = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    if (updateData.price) updateData.price = Number(updateData.price);
    if (updateData.capacity) updateData.capacity = Number(updateData.capacity);
    if (updateData.squareMeters)
      updateData.squareMeters = Number(updateData.squareMeters);
    if (updateData.floor) updateData.floor = Number(updateData.floor);
    if (updateData.discountPercent)
      updateData.discountPercent = Number(updateData.discountPercent);
    if (updateData.discountStartDate) {
      updateData.discountStartDate = new Date(updateData.discountStartDate);
    }
    if (updateData.discountEndDate) {
      updateData.discountEndDate = new Date(updateData.discountEndDate);
    }

    if (req.body.removeDiscount === "true") {
      updateData.discountPercent = 0;
      updateData.discountStartDate = null;
      updateData.discountEndDate = null;
    }

    if (req.body.amenities) {
      try {
        const amenities = JSON.parse(req.body.amenities);
        const validAmenities = await Amenity.find({
          _id: { $in: amenities },
          type: "room",
        });
        if (validAmenities.length !== amenities.length) {
          return res.status(400).json({
            success: false,
            message: "Một số tiện ích phòng không hợp lệ hoặc không tồn tại",
          });
        }
        updateData.amenities = amenities;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Định dạng tiện ích không hợp lệ",
          error: error.message,
        });
      }
    }

    if (req.files && req.files.length > 0) {
      try {
        const newImages = await cloudinaryService.uploadManyFromBuffer(
          req.files,
          "rooms"
        );
        const imageAction = req.body.imageAction || "add";
        if (imageAction === "replace") {
          if (room.images && room.images.length > 0) {
            const publicIds = room.images
              .map((img) => img.publicId)
              .filter((id) => id && id.trim() !== "");
            if (publicIds.length > 0) {
              await cloudinaryService.deleteMany(publicIds);
            }
          }
          updateData.images = newImages;
        } else {
          updateData.images = [...(room.images || []), ...newImages];
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: "Lỗi khi xử lý hình ảnh",
          error: error.message,
        });
      }
    } else if (req.body.removeImages === "true") {
      try {
        if (room.images && room.images.length > 0) {
          const publicIds = room.images
            .map((img) => img.publicId)
            .filter((id) => id && id.trim() !== "");
          if (publicIds.length > 0) {
            await cloudinaryService.deleteMany(publicIds);
          }
        }
        updateData.images = [];
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: "Lỗi khi xóa hình ảnh",
          error: error.message,
        });
      }
    } else if (req.body.removeImageIds) {
      try {
        let removeIds;
        try {
          removeIds = JSON.parse(req.body.removeImageIds);
        } catch (e) {
          removeIds = req.body.removeImageIds.split(",").map((id) => id.trim());
        }
        if (removeIds && removeIds.length > 0) {
          const publicIdsToRemove = room.images
            .filter(
              (img) =>
                removeIds.includes(img._id.toString()) ||
                removeIds.includes(img.publicId)
            )
            .map((img) => img.publicId)
            .filter((id) => id && id.trim() !== "");
          if (publicIdsToRemove.length > 0) {
            await cloudinaryService.deleteMany(publicIdsToRemove);
          }
          updateData.images = room.images.filter(
            (img) =>
              !removeIds.includes(img._id.toString()) &&
              !removeIds.includes(img.publicId)
          );
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: "Lỗi khi xóa ảnh cụ thể",
          error: error.message,
        });
      }
    }

    room = await Room.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate({
      path: "hotelId",
      select: "name address",
    });

    try {
      await updateHotelLowestPrice(room.hotelId);
    } catch (error) {
      console.error("Lỗi khi cập nhật giá thấp nhất của khách sạn:", error);
    }

    res.status(200).json({
      success: true,
      message: "Cập nhật phòng thành công",
      data: room,
    });
  } catch (error) {
    console.error("Update room error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/rooms/{id}:
 *   delete:
 *     summary: "Xóa phòng" 
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID phòng"
 *     responses:
 *       200:
 *         description: "Xóa phòng thành công"
 *       400:
 *         description: "Không thể xóa phòng đang có đơn đặt phòng"
 *       403:
 *         description: "Không có quyền xóa phòng"
 *       404:
 *         description: "Không tìm thấy phòng"
 *       500:
 *         description: "Lỗi server"
 */
exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    const hotel = await Hotel.findById(room.hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin khách sạn",
      });
    }

    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa phòng này",
      });
    }

    const hasActiveBookings = await Booking.exists({
      room: room._id,
      status: { $in: ["pending", "confirmed"] },
    });

    if (hasActiveBookings) {
      return res.status(400).json({
        success: false,
        message: "Không thể xóa phòng đang có đơn đặt phòng",
      });
    }

    if (room.images && room.images.length > 0) {
      const publicIds = room.images.map((img) => img.publicId);
      await cloudinaryService.deleteMany(publicIds);
    }

    await room.deleteOne();
    await updateHotelLowestPrice(room.hotelId);

    res.status(200).json({
      success: true,
      message: "Xóa phòng thành công",
    });
  } catch (error) {
    console.error("Delete room error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/rooms/{id}/discount:
 *   put:
 *     summary: "Cài đặt giảm giá cho phòng"
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID phòng"  
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - discountPercent
 *               - startDate
 *               - endDate
 *             properties:
 *               discountPercent:
 *                 type: number
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: "Cài đặt giảm giá thành công"
 *       400:
 *         description: "Dữ liệu không hợp lệ"
 *       403:
 *         description: "Không có quyền cài đặt giảm giá"
 *       404:
 *         description: "Không tìm thấy phòng"
 *       500:
 *         description: "Lỗi server"
 */
exports.setRoomDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const { discountPercent, startDate, endDate } = req.body;

    // Validate dữ liệu đầu vào
    if (!discountPercent || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng cung cấp phần trăm giảm giá, ngày bắt đầu và ngày kết thúc",
      });
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (startDateObj >= endDateObj) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu phải trước ngày kết thúc",
      });
    }

    // Lấy thông tin phòng
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    // Kiểm tra quyền sở hữu
    const hotel = await Hotel.findById(room.hotelId);
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cài đặt giảm giá cho phòng này",
      });
    }

    // Cập nhật thông tin giảm giá
    room.discountPercent = discountPercent;
    room.discountStartDate = startDateObj;
    room.discountEndDate = endDateObj;

    await room.save();
    await updateHotelLowestPrice(room.hotelId);

    res.status(200).json({
      success: true,
      message: "Cài đặt giảm giá thành công",
      data: room,
    });
  } catch (error) {
    console.error("Chi tiết lỗi:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/rooms/{id}/discount:
 *   delete:
 *     summary: "Hủy giảm giá phòng"
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID phòng"
 *     responses:
 *       200:
 *         description: "Hủy giảm giá thành công"
 *       403:
 *         description: "Không có quyền hủy giảm giá"
 *       404:
 *         description: "Không tìm thấy phòng"
 *       500:
 *         description: "Lỗi server"
 */
exports.removeRoomDiscount = async (req, res) => {
  try {
    const { id } = req.params;

    // Lấy thông tin phòng
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    // Kiểm tra quyền sở hữu
    const hotel = await Hotel.findById(room.hotelId);
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền hủy giảm giá cho phòng này",
      });
    }

    // Xóa thông tin giảm giá
    room.discountPercent = 0;
    room.discountStartDate = null;
    room.discountEndDate = null;

    await room.save();
    await updateHotelLowestPrice(room.hotelId);

    res.status(200).json({
      success: true,
      message: "Hủy giảm giá thành công",
      data: room,
    });
  } catch (error) {
    console.error("Chi tiết lỗi:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};
