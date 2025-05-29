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
 * /api/hotels/{hotelId}/rooms:
 *   post:
 *     summary: Tạo phòng mới cho khách sạn
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
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
 *                 description: JSON array các ID tiện ích
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Tạo phòng thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền thêm phòng
 *       404:
 *         description: Không tìm thấy khách sạn
 *       500:
 *         description: Lỗi server
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
 *     summary: Lấy thông tin chi tiết một phòng
 *     tags: [Room]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
 *     responses:
 *       200:
 *         description: Lấy thông tin phòng thành công
 *       404:
 *         description: Không tìm thấy phòng
 *       500:
 *         description: Lỗi server
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
 *     summary: Lấy danh sách phòng của khách sạn
 *     tags: [Room]
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Giá tối thiểu
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Giá tối đa
 *       - in: query
 *         name: capacity
 *         schema:
 *           type: number
 *         description: Sức chứa
 *       - in: query
 *         name: available
 *         schema:
 *           type: string
 *         description: Lọc phòng còn trống
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sắp xếp
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng mỗi trang
 *     responses:
 *       200:
 *         description: Lấy danh sách phòng thành công
 *       500:
 *         description: Lỗi server
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
 *     summary: Cập nhật thông tin phòng
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
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
 *                 description: JSON array các ID tiện ích
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               imageAction:
 *                 type: string
 *                 enum: [add, replace]
 *                 description: Thao tác với ảnh
 *               removeImages:
 *                 type: string
 *                 enum: ['true']
 *                 description: Xóa toàn bộ ảnh
 *               removeImageIds:
 *                 type: string
 *                 description: Danh sách ID ảnh cần xóa (dạng JSON hoặc chuỗi cách nhau bởi dấu phẩy)
 *               removeDiscount:
 *                 type: string
 *                 enum: ['true']
 *                 description: Hủy giảm giá phòng
 *     responses:
 *       200:
 *         description: Cập nhật phòng thành công
 *       403:
 *         description: Không có quyền cập nhật phòng
 *       404:
 *         description: Không tìm thấy phòng
 *       500:
 *         description: Lỗi server
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
 *     summary: Xóa phòng
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
 *     responses:
 *       200:
 *         description: Xóa phòng thành công
 *       400:
 *         description: Không thể xóa phòng đang có đơn đặt phòng
 *       403:
 *         description: Không có quyền xóa phòng
 *       404:
 *         description: Không tìm thấy phòng
 *       500:
 *         description: Lỗi server
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
 * /api/hotels/search:
 *   get:
 *     summary: Tìm kiếm khách sạn có phòng trống theo địa điểm, ngày và số người
 *     tags: [Room]
 *     parameters:
 *       - in: query
 *         name: locationName
 *         schema:
 *           type: string
 *         description: Tên địa điểm
 *       - in: query
 *         name: checkIn
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày nhận phòng
 *       - in: query
 *         name: checkOut
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày trả phòng
 *       - in: query
 *         name: capacity
 *         schema:
 *           type: integer
 *         description: Số người
 *       - in: query
 *         name: hotelName
 *         schema:
 *           type: string
 *         description: Tên khách sạn (tùy chọn)
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Giá tối thiểu
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Giá tối đa
 *       - in: query
 *         name: roomType
 *         schema:
 *           type: string
 *         description: Loại phòng
 *       - in: query
 *         name: amenities
 *         schema:
 *           type: string
 *         description: Danh sách tiện ích (cách nhau bằng dấu phẩy)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sắp xếp
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng mỗi trang
 *     responses:
 *       200:
 *         description: Tìm kiếm khách sạn thành công
 *       400:
 *         description: Thiếu hoặc sai tham số
 *       404:
 *         description: Không tìm thấy khách sạn hoặc địa điểm
 *       500:
 *         description: Lỗi server
 */
exports.searchHotelsWithAvailableRooms = async (req, res) => {
  try {
    const {
      locationName,
      checkIn,
      checkOut,
      capacity,
      hotelName,
      minPrice,
      maxPrice,
      roomType,
      amenities,
      sort = "price",
      page = 1,
      limit = 10,
    } = req.query;

    // Validate input
    if (!locationName || !checkIn || !checkOut || !capacity) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng cung cấp địa điểm, ngày nhận phòng, ngày trả phòng và số người",
      });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate) || isNaN(checkOutDate)) {
      return res.status(400).json({
        success: false,
        message: "Định dạng ngày không hợp lệ",
      });
    }
    if (checkInDate >= checkOutDate) {
      return res.status(400).json({
        success: false,
        message: "Ngày nhận phòng phải trước ngày trả phòng",
      });
    }

    // Find location
    const location = await Location.findOne({
      name: { $regex: locationName, $options: "i" },
      status: "active",
    });
    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa điểm du lịch này",
      });
    }

    // Find hotels
    const hotelQuery = { locationId: location._id, status: "active" };
    if (hotelName) {
      hotelQuery.name = { $regex: hotelName, $options: "i" };
    }
    const hotels = await Hotel.find(hotelQuery).select("_id");
    const hotelIds = hotels.map((h) => h._id);
    if (hotelIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn tại địa điểm này",
      });
    }

    // Build room query
    const roomQuery = {
      hotelId: { $in: hotelIds },
      capacity: { $gte: Number(capacity) },
    };
    if (roomType) {
      roomQuery.roomType = roomType;
    }
    if (amenities) {
      const amenitiesArray = Array.isArray(amenities)
        ? amenities
        : amenities.split(",");
      roomQuery.amenities = { $all: amenitiesArray };
    }

    // Sort options
    const sortOptions = {};
    if (sort === "price") sortOptions.discountedPrice = 1;
    else if (sort === "-price") sortOptions.discountedPrice = -1;
    else if (sort === "rating") sortOptions["hotelId.rating"] = 1;
    else if (sort === "-rating") sortOptions["hotelId.rating"] = -1;
    else if (sort === "discountPercent") sortOptions.discountPercent = 1;
    else if (sort === "-discountPercent") sortOptions.discountPercent = -1;

    // Fetch available rooms
    const rooms = await RoomService.findAvailableRooms(
      roomQuery,
      checkInDate,
      checkOutDate,
      {
        sort: sortOptions,
        skip: (Number(page) - 1) * Number(limit),
        limit: Number(limit),
        minPrice,
        maxPrice,
      }
    );

    // Group by hotel
    const hotelMap = new Map();
    rooms.forEach((room) => {
      const hotelId = room.hotelId._id.toString();
      if (!hotelMap.has(hotelId)) {
        hotelMap.set(hotelId, {
          _id: room.hotelId._id,
          name: room.hotelId.name,
          address: room.hotelId.address,
          rating: room.hotelId.rating,
          images: room.hotelId.images,
          featuredImage: room.hotelId.featuredImage,
          policies: room.hotelId.policies,
          lowestPrice: room.hotelId.lowestPrice,
          lowestDiscountedPrice: room.hotelId.lowestDiscountedPrice,
          highestDiscountPercent: room.hotelId.highestDiscountPercent,
          availableRoomCount: 0,
        });
      }
      hotelMap.get(hotelId).availableRoomCount += 1;
    });

    const hotelsWithAvailableRooms = Array.from(hotelMap.values());
    const total = hotelsWithAvailableRooms.length;

    res.status(200).json({
      success: true,
      count: hotelsWithAvailableRooms.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      data: hotelsWithAvailableRooms,
    });
  } catch (error) {
    console.error("Search hotels error:", {
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
 * /api/hotels/{hotelId}/rooms/available:
 *   get:
 *     summary: Lấy danh sách phòng còn trống trong một khách sạn
 *     tags: [Room]
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *       - in: query
 *         name: checkIn
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày nhận phòng
 *       - in: query
 *         name: checkOut
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày trả phòng
 *       - in: query
 *         name: capacity
 *         schema:
 *           type: integer
 *         description: Số người
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Giá tối thiểu
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Giá tối đa
 *       - in: query
 *         name: roomType
 *         schema:
 *           type: string
 *         description: Loại phòng
 *       - in: query
 *         name: amenities
 *         schema:
 *           type: string
 *         description: Danh sách tiện ích (cách nhau bằng dấu phẩy)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sắp xếp
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Số lượng mỗi trang
 *     responses:
 *       200:
 *         description: Lấy danh sách phòng còn trống thành công
 *       400:
 *         description: Thiếu hoặc sai tham số
 *       404:
 *         description: Không tìm thấy khách sạn hoặc phòng
 *       500:
 *         description: Lỗi server
 */
exports.getAvailableRoomsByHotel = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const {
      checkIn,
      checkOut,
      capacity,
      minPrice,
      maxPrice,
      roomType,
      amenities,
      sort = "price",
      page = 1,
      limit = 10,
    } = req.query;

    console.log(
      "getAvailableRoomsByHotel - Query params:",
      req.query,
      "Hotel ID:",
      hotelId
    );

    // Validate input
    if (!checkIn || !checkOut || !capacity) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng cung cấp ngày nhận phòng, ngày trả phòng và số người",
      });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate) || isNaN(checkOutDate)) {
      return res.status(400).json({
        success: false,
        message: "Định dạng ngày không hợp lệ",
      });
    }
    if (checkInDate >= checkOutDate) {
      return res.status(400).json({
        success: false,
        message: "Ngày nhận phòng phải trước ngày trả phòng",
      });
    }

    // Validate sort
    const validSortValues = [
      "price",
      "-price",
      "discountPercent",
      "-discountPercent",
    ];
    if (sort && !validSortValues.includes(sort)) {
      return res.status(400).json({
        success: false,
        message: `Giá trị sort không hợp lệ. Chấp nhận: ${validSortValues.join(
          ", "
        )}`,
      });
    }

    // Validate hotel
    const hotel = await Hotel.findById(hotelId);
    if (!hotel || hotel.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn hoặc khách sạn không hoạt động",
      });
    }

    // Build room query
    const roomQuery = {
      hotelId: new mongoose.Types.ObjectId(hotelId),
      capacity: { $gte: Number(capacity) },
    };
    if (roomType) {
      roomQuery.roomType = roomType;
    }
    if (amenities) {
      const amenitiesArray = Array.isArray(amenities)
        ? amenities
        : amenities.split(",");
      roomQuery.amenities = { $all: amenitiesArray };
    }

    // Sort options
    const sortOptions = {};
    if (sort === "price") sortOptions.discountedPrice = 1;
    else if (sort === "-price") sortOptions.discountedPrice = -1;
    else if (sort === "discountPercent") sortOptions.discountPercent = 1;
    else if (sort === "-discountPercent") sortOptions.discountPercent = -1;

    // Fetch available rooms
    const rooms = await RoomService.findAvailableRooms(
      roomQuery,
      checkInDate,
      checkOutDate,
      {
        sort: sortOptions,
        skip: (Number(page) - 1) * Number(limit),
        limit: Number(limit),
        minPrice,
        maxPrice,
      }
    );

    // Count total rooms
    const total = (
      await RoomService.findAvailableRooms(
        roomQuery,
        checkInDate,
        checkOutDate,
        { minPrice, maxPrice }
      )
    ).length;

    console.log(
      "Available rooms for hotel",
      hotelId,
      ":",
      rooms.map((room) => room._id.toString())
    );

    res.status(200).json({
      success: true,
      count: rooms.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      data: rooms.map((room) => ({
        _id: room._id,
        roomType: room.roomType,
        bedType: room.bedType,
        price: room.price,
        discountedPrice: room.discountedPrice,
        discountPercent: room.discountPercent,
        capacity: room.capacity,
        squareMeters: room.squareMeters,
        description: room.description,
        floor: room.floor,
        amenities: room.amenities,
        images: room.images,
        cancellationPolicy: room.cancellationPolicy,
      })),
    });
  } catch (error) {
    console.error("Get available rooms error:", {
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
 *     summary: Cài đặt giảm giá cho phòng
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
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
 *         description: Cài đặt giảm giá thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền cài đặt giảm giá
 *       404:
 *         description: Không tìm thấy phòng
 *       500:
 *         description: Lỗi server
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
 *     summary: Hủy giảm giá phòng
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
 *     responses:
 *       200:
 *         description: Hủy giảm giá thành công
 *       403:
 *         description: Không có quyền hủy giảm giá
 *       404:
 *         description: Không tìm thấy phòng
 *       500:
 *         description: Lỗi server
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
