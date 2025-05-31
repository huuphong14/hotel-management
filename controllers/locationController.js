const Location = require("../models/Location");
const Hotel = require("../models/Hotel");
const cloudinaryService = require("../config/cloudinaryService");

/**
 * @swagger
 * /api/locations:
 *   post:
 *     summary: Tạo địa điểm mới
 *     tags: [Location]
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
 *             properties:
 *               name:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo địa điểm thành công
 *       500:
 *         description: Lỗi server
 */
exports.createLocation = async (req, res) => {
  try {
    // Upload ảnh đại diện lên cloud nếu có
    if (req.file) {
      req.body.image = await cloudinaryService.uploadFromBuffer(
        req.file,
        "locations"
      );
    }

    const location = await Location.create(req.body);

    res.status(201).json({
      success: true,
      data: location,
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
 * /api/locations:
 *   get:
 *     summary: Lấy danh sách địa điểm
 *     tags: [Location]
 *     responses:
 *       200:
 *         description: Lấy danh sách địa điểm thành công
 *       500:
 *         description: Lỗi server
 */
exports.getLocations = async (req, res) => {
  try {
    const locations = await Location.find({ status: "active" });

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations,
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
 * /api/locations/{id}:
 *   get:
 *     summary: Lấy thông tin một địa điểm
 *     tags: [Location]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID địa điểm
 *     responses:
 *       200:
 *         description: Lấy thông tin địa điểm thành công
 *       404:
 *         description: Không tìm thấy địa điểm
 *       500:
 *         description: Lỗi server
 */
exports.getLocation = async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa điểm",
      });
    }

    res.status(200).json({
      success: true,
      data: location,
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
 * /api/locations/{id}:
 *   put:
 *     summary: Cập nhật thông tin địa điểm
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID địa điểm
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật địa điểm thành công
 *       404:
 *         description: Không tìm thấy địa điểm
 *       500:
 *         description: Lỗi server
 */
exports.updateLocation = async (req, res) => {
  try {
    let location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa điểm",
      });
    }

    // Upload ảnh đại diện lên cloud nếu có
    if (req.file) {
      // Xóa ảnh cũ nếu có
      if (location.image && location.image.publicId) {
        await cloudinaryService.deleteFile(location.image.publicId);
      }

      req.body.image = await cloudinaryService.uploadFromBuffer(
        req.file,
        "locations"
      );
    }

    location = await Location.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: location,
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
 * /api/locations/{id}:
 *   delete:
 *     summary: Xóa địa điểm
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID địa điểm
 *     responses:
 *       200:
 *         description: Xóa địa điểm thành công
 *       400:
 *         description: Không thể xóa địa điểm vì có khách sạn đang sử dụng
 *       404:
 *         description: Không tìm thấy địa điểm
 *       500:
 *         description: Lỗi server
 */
exports.deleteLocation = async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa điểm",
      });
    }

    // Kiểm tra xem có khách sạn nào đang sử dụng địa điểm này không
    const hotelsUsingLocation = await Hotel.countDocuments({
      locationId: location._id,
    });

    if (hotelsUsingLocation > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa địa điểm này vì có ${hotelsUsingLocation} khách sạn đang sử dụng`,
      });
    }

    // Xóa ảnh địa điểm trên cloud nếu có
    if (location.image && location.image.publicId) {
      await cloudinaryService.deleteFile(location.image.publicId);
    }

    await location.deleteOne();

    res.status(200).json({
      success: true,
      message: "Địa điểm đã được xóa",
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
 * /api/locations/popular:
 *   get:
 *     summary: Lấy top 10 địa điểm phổ biến nhất
 *     tags: [Location]
 *     responses:
 *       200:
 *         description: Lấy danh sách địa điểm phổ biến thành công
 *       500:
 *         description: Lỗi server
 */
exports.getPopularLocations = async (req, res) => {
  try {
    // Tìm các khách sạn có trạng thái active
    const hotels = await Hotel.find({ status: "active" });

    // Đếm số lượng khách sạn theo từng địa điểm
    const locationCounts = {};
    hotels.forEach((hotel) => {
      if (hotel.locationId) {
        const locationId = hotel.locationId.toString();
        locationCounts[locationId] = (locationCounts[locationId] || 0) + 1;
      }
    });

    // Lấy danh sách các locationId
    const locationIds = Object.keys(locationCounts);

    // Lấy thông tin chi tiết về các địa điểm
    const locations = await Location.find({
      _id: { $in: locationIds },
      status: "active",
    });

    // Kết hợp thông tin và sắp xếp theo số lượng khách sạn (giảm dần)
    const popularLocations = locations
      .map((location) => ({
        _id: location._id,
        name: location.name,
        image: location.image,
        hotelCount: locationCounts[location._id.toString()] || 0,
      }))
      .sort((a, b) => b.hotelCount - a.hotelCount)
      .slice(0, 10); // Giới hạn 10 địa điểm phổ biến nhất

    res.status(200).json({
      success: true,
      count: popularLocations.length,
      data: popularLocations,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};
