const Amenity = require("../models/Amenity");

/**
 * @swagger
 * /api/amenities:
 *   post:
 *     summary: "Tạo tiện ích mới"
 *     tags: [Amenity]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: "Tên tiện ích"
 *               icon:
 *                 type: string
 *                 description: "Icon tiện ích (nếu có)"
 *     responses:
 *       201:
 *         description: "Tạo tiện ích thành công"
 *       403:
 *         description: "Chỉ admin mới có quyền"
 *       500:
 *         description: "Lỗi server"
 */
exports.createAmenity = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có quyền thực hiện hành động này",
      });
    }

    const amenity = await Amenity.create(req.body);

    res.status(201).json({
      success: true,
      data: amenity,
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
 * /api/amenities:
 *   get:
 *     summary: "Lấy danh sách tiện ích"
 *     tags: [Amenity]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [hotel, room]
 *         description: "Lọc theo loại tiện ích (hotel hoặc room)"
 *     responses:
 *       200:
 *         description: "Lấy danh sách tiện ích thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getAmenities = async (req, res) => {
  try {
    // Tạo filter object
    const filter = {};
    
    // Nếu có query parameter type, thêm vào filter
    if (req.query.type) {
      if (req.query.type === 'hotel' || req.query.type === 'room') {
        filter.type = req.query.type;
      } else {
        return res.status(400).json({
          success: false,
          message: "Loại tiện ích không hợp lệ. Chỉ chấp nhận 'hotel' hoặc 'room'",
        });
      }
    }

    const amenities = await Amenity.find(filter);

    res.status(200).json({
      success: true,
      count: amenities.length,
      filter: req.query.type ? { type: req.query.type } : "all",
      data: amenities,
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
 * /api/amenities/{id}:
 *   get:
 *     summary: "Lấy thông tin một tiện ích"
 *     tags: [Amenity]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID tiện ích"
 *     responses:
 *       200:
 *         description: "Lấy thông tin tiện ích thành công"
 *       404:
 *         description: "Không tìm thấy tiện ích"
 *       500:
 *         description: "Lỗi server"
 */
exports.getAmenity = async (req, res) => {
  try {
    const amenity = await Amenity.findById(req.params.id);

    if (!amenity) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tiện ích",
      });
    }

    res.status(200).json({
      success: true,
      data: amenity,
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
 * /api/amenities/{id}:
 *   put:
 *     summary: "Cập nhật tiện ích"
 *     tags: [Amenity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID tiện ích"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: "Tên tiện ích"
 *               icon:
 *                 type: string
 *                 description: "Icon tiện ích (nếu có)"
 *     responses:
 *       200:
 *         description: "Cập nhật tiện ích thành công"
 *       403:
 *         description: "Chỉ admin mới có quyền"
 *       404:
 *         description: "Không tìm thấy tiện ích"
 *       500:
 *         description: "Lỗi server"
 */
exports.updateAmenity = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có quyền thực hiện hành động này",
      });
    }

    const amenity = await Amenity.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!amenity) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tiện ích",
      });
    }

    res.status(200).json({
      success: true,
      data: amenity,
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
 * /api/amenities/{id}:
 *   delete:
 *     summary: "Xóa tiện ích"  
 *     tags: [Amenity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: "ID tiện ích"
 *     responses:
 *       200:
 *         description: "Xóa tiện ích thành công"
 *       403:
 *         description: "Chỉ admin mới có quyền"
 *       404:
 *         description: "Không tìm thấy tiện ích"
 *       500:
 *         description: "Lỗi server"
 */
exports.deleteAmenity = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có quyền thực hiện hành động này",
      });
    }

    const amenity = await Amenity.findById(req.params.id);

    if (!amenity) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tiện ích",
      });
    }

    await amenity.deleteOne();

    res.status(200).json({
      success: true,
      message: "Tiện ích đã được xóa",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};
