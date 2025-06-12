const Location = require("../models/Location");
const Hotel = require("../models/Hotel");
const cloudinaryService = require("../config/cloudinaryService");

/**
 * @swagger
 * /api/locations:
 *   post:
 *     summary: "Tạo địa điểm mới"
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
 *         description: "Tạo địa điểm thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.createLocation = async (req, res) => {
  console.log('🏢 [CREATE LOCATION] Starting location creation process');
  console.log('📝 [CREATE LOCATION] Request body:', JSON.stringify(req.body, null, 2));
  console.log('📷 [CREATE LOCATION] File uploaded:', req.file ? 'Yes' : 'No');
  
  try {
    // Upload ảnh đại diện lên cloud nếu có
    if (req.file) {
      console.log('☁️ [CREATE LOCATION] Uploading image to cloudinary...');
      console.log('📁 [CREATE LOCATION] File details:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      
      req.body.image = await cloudinaryService.uploadFromBuffer(
        req.file,
        "locations"
      );
      
      console.log('✅ [CREATE LOCATION] Image uploaded successfully:', {
        url: req.body.image?.url || 'N/A',
        publicId: req.body.image?.publicId || 'N/A'
      });
    }

    console.log('💾 [CREATE LOCATION] Creating location in database...');
    const location = await Location.create(req.body);
    
    console.log('🎉 [CREATE LOCATION] Location created successfully:', {
      id: location._id,
      name: location.name,
      hasImage: !!location.image
    });

    res.status(201).json({
      success: true,
      data: location,
    });
  } catch (error) {
    console.error('❌ [CREATE LOCATION] Error occurred:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
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
 *     summary: "Lấy danh sách địa điểm"
 *     tags: [Location]
 *     responses:
 *       200:
 *         description: "Lấy danh sách địa điểm thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getLocations = async (req, res) => {
  console.log('📋 [GET LOCATIONS] Starting to fetch locations list');
  
  try {
    console.log('🔍 [GET LOCATIONS] Querying active locations from database...');
    const locations = await Location.find({ status: "active" });
    
    console.log('✅ [GET LOCATIONS] Locations fetched successfully:', {
      count: locations.length,
      locationNames: locations.map(loc => loc.name)
    });

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations,
    });
  } catch (error) {
    console.error('❌ [GET LOCATIONS] Error occurred:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
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
 *     summary: "Lấy thông tin một địa điểm"
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
 *         description: "Lấy thông tin địa điểm thành công"
 *       404:
 *         description: "Không tìm thấy địa điểm"
 *       500:
 *         description: "Lỗi server"
 */
exports.getLocation = async (req, res) => {
  const locationId = req.params.id;
  console.log('🔍 [GET LOCATION] Starting to fetch single location:', { locationId });
  
  try {
    console.log('💾 [GET LOCATION] Querying location from database...');
    const location = await Location.findById(locationId);

    if (!location) {
      console.log('⚠️ [GET LOCATION] Location not found:', { locationId });
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa điểm",
      });
    }

    console.log('✅ [GET LOCATION] Location found successfully:', {
      id: location._id,
      name: location.name,
      status: location.status
    });

    res.status(200).json({
      success: true,
      data: location,
    });
  } catch (error) {
    console.error('❌ [GET LOCATION] Error occurred:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      locationId
    });
    
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
 *     summary: "Cập nhật thông tin địa điểm"
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
 *         description: "Cập nhật địa điểm thành công"
 *       404:
 *         description: "Không tìm thấy địa điểm"
 *       500:
 *         description: "Lỗi server"
 */
exports.updateLocation = async (req, res) => {
  const locationId = req.params.id;
  console.log('✏️ [UPDATE LOCATION] Starting location update process:', { locationId });
  console.log('📝 [UPDATE LOCATION] Request body:', JSON.stringify(req.body, null, 2));
  console.log('📷 [UPDATE LOCATION] New file uploaded:', req.file ? 'Yes' : 'No');
  
  try {
    console.log('🔍 [UPDATE LOCATION] Finding existing location...');
    let location = await Location.findById(locationId);

    if (!location) {
      console.log('⚠️ [UPDATE LOCATION] Location not found:', { locationId });
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa điểm",
      });
    }

    console.log('✅ [UPDATE LOCATION] Location found:', {
      id: location._id,
      name: location.name,
      hasExistingImage: !!location.image
    });

    // Upload ảnh đại diện lên cloud nếu có
    if (req.file) {
      console.log('🗑️ [UPDATE LOCATION] Processing image update...');
      
      // Xóa ảnh cũ nếu có
      if (location.image && location.image.publicId) {
        console.log('🗑️ [UPDATE LOCATION] Deleting old image:', {
          publicId: location.image.publicId
        });
        
        await cloudinaryService.deleteFile(location.image.publicId);
        console.log('✅ [UPDATE LOCATION] Old image deleted successfully');
      }

      console.log('☁️ [UPDATE LOCATION] Uploading new image...');
      console.log('📁 [UPDATE LOCATION] New file details:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });

      req.body.image = await cloudinaryService.uploadFromBuffer(
        req.file,
        "locations"
      );
      
      console.log('✅ [UPDATE LOCATION] New image uploaded successfully:', {
        url: req.body.image?.url || 'N/A',
        publicId: req.body.image?.publicId || 'N/A'
      });
    }

    console.log('💾 [UPDATE LOCATION] Updating location in database...');
    location = await Location.findByIdAndUpdate(locationId, req.body, {
      new: true,
      runValidators: true,
    });

    console.log('🎉 [UPDATE LOCATION] Location updated successfully:', {
      id: location._id,
      name: location.name,
      hasImage: !!location.image
    });

    res.status(200).json({
      success: true,
      data: location,
    });
  } catch (error) {
    console.error('❌ [UPDATE LOCATION] Error occurred:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      locationId
    });
    
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
 *     summary: "Xóa địa điểm"
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
 *         description: "Xóa địa điểm thành công"
 *       400:
 *         description: "Không thể xóa địa điểm vì có khách sạn đang sử dụng"
 *       404:
 *         description: "Không tìm thấy địa điểm"
 *       500:
 *         description: "Lỗi server"
 */
exports.deleteLocation = async (req, res) => {
  const locationId = req.params.id;
  console.log('🗑️ [DELETE LOCATION] Starting location deletion process:', { locationId });
  
  try {
    console.log('🔍 [DELETE LOCATION] Finding location to delete...');
    const location = await Location.findById(locationId);

    if (!location) {
      console.log('⚠️ [DELETE LOCATION] Location not found:', { locationId });
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa điểm",
      });
    }

    console.log('✅ [DELETE LOCATION] Location found:', {
      id: location._id,
      name: location.name
    });

    // Kiểm tra xem có khách sạn nào đang sử dụng địa điểm này không
    console.log('🏨 [DELETE LOCATION] Checking for hotels using this location...');
    const hotelsUsingLocation = await Hotel.countDocuments({
      locationId: location._id,
    });

    console.log('📊 [DELETE LOCATION] Hotels count check result:', {
      hotelsCount: hotelsUsingLocation
    });

    if (hotelsUsingLocation > 0) {
      console.log('⚠️ [DELETE LOCATION] Cannot delete - hotels are using this location:', {
        locationId,
        hotelsCount: hotelsUsingLocation
      });
      
      return res.status(400).json({
        success: false,
        message: `Không thể xóa địa điểm này vì có ${hotelsUsingLocation} khách sạn đang sử dụng`,
      });
    }

    // Xóa ảnh địa điểm trên cloud nếu có
    if (location.image && location.image.publicId) {
      console.log('☁️ [DELETE LOCATION] Deleting location image from cloudinary:', {
        publicId: location.image.publicId
      });
      
      await cloudinaryService.deleteFile(location.image.publicId);
      console.log('✅ [DELETE LOCATION] Image deleted from cloudinary successfully');
    }

    console.log('💾 [DELETE LOCATION] Deleting location from database...');
    await location.deleteOne();
    
    console.log('🎉 [DELETE LOCATION] Location deleted successfully:', {
      id: location._id,
      name: location.name
    });

    res.status(200).json({
      success: true,
      message: "Địa điểm đã được xóa",
    });
  } catch (error) {
    console.error('❌ [DELETE LOCATION] Error occurred:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      locationId
    });
    
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/locations/search:
 *   get:
 *     summary: "Tìm kiếm địa điểm theo tên"
 *     tags: [Location]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: "Từ khóa tìm kiếm"
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *         description: "Số lượng kết quả tối đa"
 *     responses:
 *       200:
 *         description: "Tìm kiếm địa điểm thành công"
 *       400:
 *         description: "Thiếu từ khóa tìm kiếm"
 *       500:
 *         description: "Lỗi server"
 */
exports.searchLocations = async (req, res) => {
  const { q, limit = 10 } = req.query;
  
  console.log('🔍 [SEARCH LOCATIONS] Starting location search:', { 
    query: q, 
    limit: parseInt(limit) 
  });
  
  try {
    if (!q || q.trim() === '') {
      console.log('⚠️ [SEARCH LOCATIONS] Empty search query provided');
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập từ khóa tìm kiếm",
      });
    }

    const searchQuery = q.trim();
    console.log('🔍 [SEARCH LOCATIONS] Searching locations with regex...');
    
    // Tìm kiếm không phân biệt hoa thường và chứa từ khóa
    const locations = await Location.find({
      name: { $regex: searchQuery, $options: 'i' },
      status: "active"
    })
    .select('_id name image') // Chỉ lấy các field cần thiết
    .limit(parseInt(limit))
    .sort({ name: 1 }); // Sắp xếp theo tên A-Z

    console.log('✅ [SEARCH LOCATIONS] Search completed:', {
      searchQuery,
      foundLocations: locations.length,
      locationNames: locations.map(loc => loc.name)
    });

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations,
    });
  } catch (error) {
    console.error('❌ [SEARCH LOCATIONS] Error occurred:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      searchQuery: q
    });
    
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
 *     summary: "Lấy top 10 địa điểm phổ biến nhất"   
 *     tags: [Location]
 *     responses:
 *       200:
 *         description: "Lấy danh sách địa điểm phổ biến thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getPopularLocations = async (req, res) => {
  console.log('🔥 [GET POPULAR LOCATIONS] Starting to fetch popular locations');
  
  try {
    // Tìm các khách sạn có trạng thái active
    console.log('🏨 [GET POPULAR LOCATIONS] Fetching active hotels...');
    const hotels = await Hotel.find({ status: "active" });
    
    console.log('📊 [GET POPULAR LOCATIONS] Hotels fetched:', {
      totalHotels: hotels.length
    });

    // Đếm số lượng khách sạn theo từng địa điểm
    console.log('🧮 [GET POPULAR LOCATIONS] Counting hotels by location...');
    const locationCounts = {};
    let hotelsWithLocation = 0;
    let hotelsWithoutLocation = 0;
    
    hotels.forEach((hotel) => {
      if (hotel.locationId) {
        const locationId = hotel.locationId.toString();
        locationCounts[locationId] = (locationCounts[locationId] || 0) + 1;
        hotelsWithLocation++;
      } else {
        hotelsWithoutLocation++;
      }
    });

    console.log('📈 [GET POPULAR LOCATIONS] Location counting results:', {
      uniqueLocations: Object.keys(locationCounts).length,
      hotelsWithLocation,
      hotelsWithoutLocation,
      locationCounts: Object.entries(locationCounts).map(([id, count]) => ({ locationId: id, hotelCount: count }))
    });

    // Lấy danh sách các locationId
    const locationIds = Object.keys(locationCounts);
    
    console.log('🔍 [GET POPULAR LOCATIONS] Fetching location details...');
    // Lấy thông tin chi tiết về các địa điểm
    const locations = await Location.find({
      _id: { $in: locationIds },
      status: "active",
    });

    console.log('📍 [GET POPULAR LOCATIONS] Active locations found:', {
      foundLocations: locations.length,
      locationNames: locations.map(loc => ({ id: loc._id, name: loc.name }))
    });

    // Kết hợp thông tin và sắp xếp theo số lượng khách sạn (giảm dần)
    console.log('🔄 [GET POPULAR LOCATIONS] Processing and sorting locations...');
    const popularLocations = locations
      .map((location) => ({
        _id: location._id,
        name: location.name,
        image: location.image,
        hotelCount: locationCounts[location._id.toString()] || 0,
      }))
      .sort((a, b) => b.hotelCount - a.hotelCount)
      .slice(0, 10); // Giới hạn 10 địa điểm phổ biến nhất

    console.log('✅ [GET POPULAR LOCATIONS] Popular locations processed successfully:', {
      totalPopularLocations: popularLocations.length,
      topLocations: popularLocations.map(loc => ({ 
        name: loc.name, 
        hotelCount: loc.hotelCount 
      }))
    });

    res.status(200).json({
      success: true,
      count: popularLocations.length,
      data: popularLocations,
    });
  } catch (error) {
    console.error('❌ [GET POPULAR LOCATIONS] Error occurred:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};