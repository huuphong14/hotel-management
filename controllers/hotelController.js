const Hotel = require("../models/Hotel");
const cloudinaryService = require("../config/cloudinaryService");
const Room = require("../models/Room");
const Location = require("../models/Location");
const RoomService = require("../services/roomService");
const mongoose = require("mongoose");

/**
 * @swagger
 * /api/hotels:
 *   post:
 *     summary: Tạo khách sạn mới
 *     tags: [Hotel]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - address
 *               - locationId
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               locationId:
 *                 type: string
 *               featuredImage:
 *                 type: string
 *                 format: binary
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Tạo khách sạn thành công
 *       500:
 *         description: Lỗi server
 */
exports.createHotel = async (req, res) => {
  try {
    req.body.ownerId = req.user.id;

    // Upload ảnh đại diện lên cloud nếu có
    if (
      req.files &&
      req.files.featuredImage &&
      req.files.featuredImage.length > 0
    ) {
      const featuredImage = req.files.featuredImage[0];
      req.body.featuredImage = await cloudinaryService.uploadFromBuffer(
        featuredImage
      );
    }

    // Upload mảng ảnh lên cloud nếu có
    if (req.files && req.files.images && req.files.images.length > 0) {
      req.body.images = await cloudinaryService.uploadManyFromBuffer(
        req.files.images
      );
    }

    const hotel = await Hotel.create(req.body);

    res.status(201).json({
      success: true,
      data: hotel,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/my-hotels:
 *   get:
 *     summary: Lấy danh sách khách sạn của người dùng đăng nhập
 *     tags: [Hotel]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách khách sạn thành công
 *       403:
 *         description: Chỉ đối tác mới có thể xem danh sách khách sạn của mình
 *       500:
 *         description: Lỗi server
 */
exports.getMyHotels = async (req, res) => {
  try {
    // Lấy ID của người dùng đang đăng nhập
    const userId = req.user.id;

    // Kiểm tra nếu người dùng có vai trò partner
    if (req.user.role !== "partner") {
      return res.status(403).json({
        success: false,
        message: "Chỉ đối tác mới có thể xem danh sách khách sạn của mình",
      });
    }

    console.log(`Đang tìm kiếm khách sạn của đối tác ${userId}`);

    // Tìm tất cả khách sạn mà người dùng sở hữu
    const hotels = await Hotel.find({ ownerId: userId });

    console.log(`Đã tìm thấy ${hotels.length} khách sạn của đối tác`);

    // Trả về kết quả
    res.status(200).json({
      success: true,
      count: hotels.length,
      data: hotels,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách khách sạn của đối tác:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels:
 *   get:
 *     summary: Lấy danh sách khách sạn
 *     tags: [Hotel]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Tên khách sạn
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *         description: ID địa điểm
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
 *         name: minDiscountPercent
 *         schema:
 *           type: number
 *         description: Phần trăm giảm giá tối thiểu
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
 *         description: Lấy danh sách khách sạn thành công
 *       500:
 *         description: Lỗi server
 */
exports.getHotels = async (req, res) => {
  try {
    const {
      name,
      locationId,
      minPrice,
      maxPrice,
      minDiscountPercent, // Thêm tham số mới
      sort = "-createdAt",
      page = 1,
      limit = 10,
    } = req.query;

    // Xây dựng query
    const query = {};

    if (name) {
      query.name = { $regex: name, $options: "i" };
    }

    if (locationId) {
      query.locationId = locationId;
    }

    // Lọc theo giá (sử dụng giá sau giảm)
    if (minPrice || maxPrice) {
      query.lowestDiscountedPrice = {};
      if (minPrice) query.lowestDiscountedPrice.$gte = Number(minPrice);
      if (maxPrice) query.lowestDiscountedPrice.$lte = Number(maxPrice);
    }

    // Lọc theo phần trăm giảm giá
    if (minDiscountPercent) {
      query.highestDiscountPercent = { $gte: Number(minDiscountPercent) };
    }

    // Áp dụng trạng thái
    query.status = "active";

    // Xây dựng tùy chọn sắp xếp
    let sortOption = sort;
    if (sort === "price") {
      sortOption = "lowestDiscountedPrice";
    } else if (sort === "-price") {
      sortOption = "-lowestDiscountedPrice";
    } else if (sort === "discount") {
      sortOption = "highestDiscountPercent";
    } else if (sort === "-discount") {
      sortOption = "-highestDiscountPercent";
    }

    // Tính toán pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Thực hiện query
    const hotels = await Hotel.find(query)
      .populate("ownerId", "name email")
      .populate("locationId", "name")
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    // Đếm tổng số khách sạn thỏa mãn điều kiện
    const total = await Hotel.countDocuments(query);

    // Thêm thông tin giảm giá chi tiết vào kết quả
    const hotelsWithDiscountDetails = hotels.map((hotel) => {
      const hotelObj = hotel.toObject();

      // Thêm thông tin về giảm giá
      if (hotel.highestDiscountPercent > 0) {
        hotelObj.hasDiscount = true;
        hotelObj.originalPrice = hotel.lowestPrice;
        hotelObj.discountedPrice = hotel.lowestDiscountedPrice;
        hotelObj.discountPercent = hotel.highestDiscountPercent;
        hotelObj.savingAmount = hotel.lowestPrice - hotel.lowestDiscountedPrice;
      } else {
        hotelObj.hasDiscount = false;
        hotelObj.originalPrice = hotel.lowestPrice;
        hotelObj.discountedPrice = hotel.lowestPrice;
      }

      return hotelObj;
    });

    res.status(200).json({
      success: true,
      count: hotels.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      data: hotelsWithDiscountDetails,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/{id}:
 *   get:
 *     summary: Lấy thông tin một khách sạn
 *     tags: [Hotel]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     responses:
 *       200:
 *         description: Lấy thông tin khách sạn thành công
 *       404:
 *         description: Không tìm thấy khách sạn
 *       500:
 *         description: Lỗi server
 */
exports.getHotel = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id)
      .populate("ownerId", "name email")
      .populate("locationId", "name");

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn",
      });
    }

    res.status(200).json({
      success: true,
      data: hotel,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/{id}:
 *   put:
 *     summary: Cập nhật thông tin khách sạn
 *     tags: [Hotel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               locationId:
 *                 type: string
 *               featuredImage:
 *                 type: string
 *                 format: binary
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               replaceAllImages:
 *                 type: string
 *                 enum: ['true', 'false']
 *                 description: Thay thế toàn bộ ảnh cũ
 *     responses:
 *       200:
 *         description: Cập nhật khách sạn thành công
 *       403:
 *         description: Không có quyền cập nhật khách sạn
 *       404:
 *         description: Không tìm thấy khách sạn
 *       500:
 *         description: Lỗi server
 */
exports.updateHotel = async (req, res) => {
  try {
    let hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn",
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật khách sạn này",
      });
    }

    // Upload ảnh đại diện lên cloud nếu có
    if (
      req.files &&
      req.files.featuredImage &&
      req.files.featuredImage.length > 0
    ) {
      // Xóa ảnh cũ nếu có
      if (hotel.featuredImage && hotel.featuredImage.publicId) {
        await cloudinaryService.deleteFile(hotel.featuredImage.publicId);
      }

      const featuredImage = req.files.featuredImage[0];
      req.body.featuredImage = await cloudinaryService.uploadFromBuffer(
        featuredImage
      );
    }

    // Xử lý mảng ảnh nếu có
    if (req.files && req.files.images && req.files.images.length > 0) {
      // Nếu muốn thay thế toàn bộ ảnh cũ
      if (req.body.replaceAllImages === "true") {
        // Xóa tất cả ảnh cũ trên cloud
        if (hotel.images && hotel.images.length > 0) {
          const publicIds = hotel.images
            .filter((img) => img.publicId)
            .map((img) => img.publicId);
          await cloudinaryService.deleteMany(publicIds);
        }

        // Upload tất cả ảnh mới
        req.body.images = await cloudinaryService.uploadManyFromBuffer(
          req.files.images
        );
      } else {
        // Nếu muốn thêm ảnh mới vào mảng ảnh hiện tại
        const newImages = await cloudinaryService.uploadManyFromBuffer(
          req.files.images
        );

        // Lấy mảng ảnh hiện tại
        const currentImages = hotel.images || [];

        // Gộp mảng ảnh mới và cũ
        req.body.images = [...currentImages, ...newImages];
      }
    }

    hotel = await Hotel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: hotel,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/location/{locationId}:
 *   get:
 *     summary: Lấy danh sách khách sạn theo địa điểm
 *     tags: [Hotel]
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID địa điểm
 *     responses:
 *       200:
 *         description: Lấy danh sách khách sạn thành công
 *       500:
 *         description: Lỗi server
 */
exports.getHotelsByLocation = async (req, res) => {
  try {
    const hotels = await Hotel.find({
      locationId: req.params.locationId,
      status: "active",
    })
      .populate("locationId", "name")
      .populate("ownerId", "name");

    res.status(200).json({
      success: true,
      count: hotels.length,
      data: hotels,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/{id}:
 *   delete:
 *     summary: Xóa khách sạn
 *     tags: [Hotel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     responses:
 *       200:
 *         description: Xóa khách sạn thành công
 *       403:
 *         description: Không có quyền xóa khách sạn
 *       404:
 *         description: Không tìm thấy khách sạn
 *       500:
 *         description: Lỗi server
 */
exports.deleteHotel = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn",
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa khách sạn này",
      });
    }

    // Xóa ảnh đại diện trên cloud nếu có
    if (hotel.featuredImage && hotel.featuredImage.publicId) {
      await cloudinaryService.deleteFile(hotel.featuredImage.publicId);
    }

    // Xóa tất cả ảnh trong mảng images
    if (hotel.images && hotel.images.length > 0) {
      const publicIds = hotel.images
        .filter((img) => img.publicId)
        .map((img) => img.publicId);
      await cloudinaryService.deleteMany(publicIds);
    }

    await hotel.deleteOne();

    res.status(200).json({
      success: true,
      message: "Khách sạn đã được xóa",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/{id}/images:
 *   post:
 *     summary: Upload hình ảnh cho khách sạn
 *     tags: [Hotel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Upload hình ảnh thành công
 *       400:
 *         description: Vui lòng upload ít nhất một hình ảnh
 *       403:
 *         description: Không có quyền cập nhật khách sạn
 *       404:
 *         description: Không tìm thấy khách sạn
 *       500:
 *         description: Lỗi server
 */
exports.uploadHotelImages = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn",
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật khách sạn này",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng upload ít nhất một hình ảnh",
      });
    }

    // Upload các ảnh mới lên cloud
    const newImages = await cloudinaryService.uploadManyFromBuffer(req.files);

    // Thêm ảnh mới vào mảng ảnh hiện tại
    const currentImages = hotel.images || [];
    hotel.images = [...currentImages, ...newImages];

    await hotel.save();

    res.status(200).json({
      success: true,
      count: hotel.images.length,
      data: hotel.images,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/{id}/images/{imageIndex}:
 *   delete:
 *     summary: Xóa một ảnh từ mảng images của khách sạn
 *     tags: [Hotel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *       - in: path
 *         name: imageIndex
 *         required: true
 *         schema:
 *           type: integer
 *         description: Vị trí ảnh trong mảng images
 *     responses:
 *       200:
 *         description: Xóa hình ảnh thành công
 *       403:
 *         description: Không có quyền cập nhật khách sạn
 *       404:
 *         description: Không tìm thấy khách sạn hoặc hình ảnh
 *       500:
 *         description: Lỗi server
 */
exports.deleteHotelImage = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn",
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật khách sạn này",
      });
    }

    const imageIndex = parseInt(req.params.imageIndex);

    if (!hotel.images || imageIndex >= hotel.images.length || imageIndex < 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hình ảnh",
      });
    }

    // Lấy ảnh cần xóa
    const imageToDelete = hotel.images[imageIndex];

    // Xóa ảnh trên Cloudinary
    if (imageToDelete.publicId) {
      await cloudinaryService.deleteFile(imageToDelete.publicId);
    }

    // Xóa ảnh khỏi mảng
    hotel.images.splice(imageIndex, 1);
    await hotel.save();

    res.status(200).json({
      success: true,
      message: "Đã xóa hình ảnh thành công",
      data: hotel.images,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/{id}/featured-image:
 *   put:
 *     summary: Cập nhật ảnh đại diện khách sạn
 *     tags: [Hotel]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               featuredImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Cập nhật ảnh đại diện thành công
 *       400:
 *         description: Vui lòng upload hình ảnh
 *       403:
 *         description: Không có quyền cập nhật khách sạn
 *       404:
 *         description: Không tìm thấy khách sạn
 *       500:
 *         description: Lỗi server
 */
exports.updateFeaturedImage = async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn",
      });
    }

    // Kiểm tra quyền
    if (hotel.ownerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật khách sạn này",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng upload hình ảnh",
      });
    }

    // Xóa ảnh đại diện cũ trên cloud nếu có
    if (hotel.featuredImage && hotel.featuredImage.publicId) {
      await cloudinaryService.deleteFile(hotel.featuredImage.publicId);
    }

    // Upload ảnh mới lên cloud
    hotel.featuredImage = await cloudinaryService.uploadFromBuffer(req.file);
    await hotel.save();

    res.status(200).json({
      success: true,
      data: hotel.featuredImage,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/hotels/discounts:
 *   get:
 *     summary: Lấy danh sách khách sạn đang có giảm giá
 *     tags: [Hotel]
 *     parameters:
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
 *         description: Lấy danh sách khách sạn giảm giá thành công
 *       500:
 *         description: Lỗi server
 */
exports.getDiscountedHotels = async (req, res) => {
  try {
    const {
      sort = "-highestDiscountPercent",
      page = 1,
      limit = 10,
    } = req.query;

    // Tìm khách sạn có giảm giá
    const query = {
      highestDiscountPercent: { $gt: 0 },
      status: "active",
    };

    // Tính toán phân trang
    const skip = (Number(page) - 1) * Number(limit);

    // Lấy thông tin khách sạn có giảm giá
    const hotels = await Hotel.find(query)
      .populate("ownerId", "name email")
      .populate("locationId", "name")
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    // Đếm tổng số khách sạn có giảm giá
    const total = await Hotel.countDocuments(query);

    // Định dạng lại kết quả với thông tin chi tiết về giảm giá
    const hotelsWithDiscountInfo = hotels.map((hotel) => {
      const hotelObj = hotel.toObject();

      hotelObj.hasDiscount = true;
      hotelObj.originalPrice = hotel.lowestPrice;
      hotelObj.discountedPrice = hotel.lowestDiscountedPrice;
      hotelObj.discountPercent = hotel.highestDiscountPercent;
      hotelObj.savingAmount = hotel.lowestPrice - hotel.lowestDiscountedPrice;

      return hotelObj;
    });

    res.status(200).json({
      success: true,
      count: hotelsWithDiscountInfo.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      data: hotelsWithDiscountInfo,
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
 * /api/hotels/search:
 *   get:
 *     summary: Tìm kiếm khách sạn có phòng trống theo địa điểm, ngày và số người
 *     tags: [Hotel]
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
      minPrice,
      maxPrice,
      minRating,
      maxRating,
      roomTypes,
      amenities,
      sort = "price",
      page = 1,
      limit = 10,
    } = req.query;

    // Validate input
    if (!locationName || !checkIn || !checkOut || !capacity) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp địa điểm, ngày nhận phòng, ngày trả phòng và số người",
      });
    }

    // Validate rating range if provided
    if (minRating && (isNaN(minRating) || minRating < 0 || minRating > 5)) {
      return res.status(400).json({
        success: false,
        message: "Đánh giá tối thiểu phải từ 0 đến 5",
      });
    }
    if (maxRating && (isNaN(maxRating) || maxRating < 0 || maxRating > 5)) {
      return res.status(400).json({
        success: false,
        message: "Đánh giá tối đa phải từ 0 đến 5",
      });
    }
    if (minRating && maxRating && Number(minRating) > Number(maxRating)) {
      return res.status(400).json({
        success: false,
        message: "Đánh giá tối thiểu không thể lớn hơn đánh giá tối đa",
      });
    }

    // Validate room types if provided
    let roomTypesArray = [];
    if (roomTypes) {
      roomTypesArray = roomTypes.split(',').map(type => type.trim());
      const validRoomTypes = ['Standard', 'Superior', 'Deluxe', 'Suite', 'Family'];
      const invalidTypes = roomTypesArray.filter(type => !validRoomTypes.includes(type));
      if (invalidTypes.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Loại phòng không hợp lệ: ${invalidTypes.join(', ')}. Các loại phòng hợp lệ: ${validRoomTypes.join(', ')}`,
        });
      }
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

    // Build room query
    const roomQuery = {
      capacity: { $gte: Number(capacity) },
      status: "available",
    };

    // Thêm điều kiện lọc theo loại phòng nếu có
    if (roomTypesArray.length > 0) {
      roomQuery.roomType = { $in: roomTypesArray };
    }

    // Fetch available rooms with hotels
    const hotels = await RoomService.findAvailableRooms(
      roomQuery,
      checkInDate,
      checkOutDate,
      {
        sort,
        skip: (Number(page) - 1) * Number(limit),
        limit: Number(limit),
        minPrice,
        maxPrice,
        locationId: location._id,
        minRating: minRating ? Number(minRating) : undefined,
        maxRating: maxRating ? Number(maxRating) : undefined,
        amenities: amenities ? amenities.split(',').map(id => id.trim()) : undefined
      }
    );

    // Get total count for pagination
    const totalHotels = await RoomService.countAvailableHotels(
      roomQuery,
      checkInDate,
      checkOutDate,
      { 
        minPrice, 
        maxPrice,
        locationId: location._id,
        minRating: minRating ? Number(minRating) : undefined,
        maxRating: maxRating ? Number(maxRating) : undefined,
        amenities: amenities ? amenities.split(',').map(id => id.trim()) : undefined
      }
    );

    res.status(200).json({
      success: true,
      count: hotels.length,
      total: totalHotels,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalHotels / Number(limit)),
      },
      data: hotels,
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
 *     tags: [Hotel]
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

    // Validate input
    if (!checkIn || !checkOut || !capacity) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp ngày nhận phòng, ngày trả phòng và số người",
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

    // Validate hotel exists and is active
    const hotel = await Hotel.findOne({ _id: hotelId, status: 'active' });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khách sạn hoặc khách sạn không hoạt động",
      });
    }

    // Build room query
    const roomQuery = {
      capacity: { $gte: Number(capacity) },
    };

    if (roomType) {
      roomQuery.roomType = roomType;
    }

    if (amenities) {
      const amenityIds = amenities.split(",").map((id) => id.trim());
      roomQuery.amenities = { $all: amenityIds };
    }

    // Get available rooms
    const { rooms, total } = await RoomService.getAvailableRoomsByHotel(
      hotelId,
      roomQuery,
      checkInDate,
      checkOutDate,
      {
        sort,
        skip: (Number(page) - 1) * Number(limit),
        limit: Number(limit),
        minPrice,
        maxPrice,
      }
    );

    res.status(200).json({
      success: true,
      count: rooms.length,
      total,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      data: rooms.map(room => ({
        _id: room._id,
        name: room.name,
        description: room.description,
        floor: room.floor,
        roomType: room.roomType,
        bedType: room.bedType,
        price: room.price,
        discountedPrice: room.discountedPrice,
        discountPercent: room.currentDiscountPercent,
        capacity: room.capacity,
        squareMeters: room.squareMeters,
        amenities: room.amenities,
        images: room.images,
        status: room.status
      }))
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
