const Post = require("../models/Post");
const PostInteraction = require("../models/PostInteraction");
const cloudinaryService = require("../config/cloudinaryService");

/**
 * @swagger
 * /api/posts:
 *   post:
 *     summary: Tạo bài viết mới
 *     tags: [Post]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Tạo bài viết thành công
 *       500:
 *         description: Lỗi server
 */
exports.createPost = async (req, res) => {
  try {
    req.body.userId = req.user.id;

    let images = [];
    if (req.files && req.files.length > 0) {
      images = await cloudinaryService.uploadManyFromBuffer(req.files, "posts");
    }

    req.body.images = images;
    const post = await Post.create(req.body);

    res.status(201).json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error("Create post error:", {
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
 * /api/posts:
 *   get:
 *     summary: Lấy danh sách bài viết
 *     tags: [Post]
 *     responses:
 *       200:
 *         description: Lấy danh sách bài viết thành công
 *       500:
 *         description: Lỗi server
 */
exports.getPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("userId", "name email")
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/posts/{id}:
 *   get:
 *     summary: Lấy chi tiết bài viết
 *     tags: [Post]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bài viết
 *     responses:
 *       200:
 *         description: Lấy chi tiết bài viết thành công
 *       404:
 *         description: Không tìm thấy bài viết
 *       500:
 *         description: Lỗi server
 */
exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate(
      "userId",
      "name email"
    );

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/posts/{id}:
 *   put:
 *     summary: Cập nhật bài viết
 *     tags: [Post]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bài viết
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
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
 *     responses:
 *       200:
 *         description: Cập nhật bài viết thành công
 *       403:
 *         description: Không có quyền cập nhật bài viết
 *       404:
 *         description: Không tìm thấy bài viết
 *       500:
 *         description: Lỗi server
 */
exports.updatePost = async (req, res) => {
  try {
    let post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    // Kiểm tra quyền: chỉ chủ bài viết (partner) hoặc admin được phép cập nhật
    if (post.userId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật bài viết này",
      });
    }

    // Các trường được phép cập nhật
    const allowedFields = ["title", "content", "status"];
    const updateData = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    // Xử lý hình ảnh
    if (req.files && req.files.length > 0) {
      try {
        const newImages = await cloudinaryService.uploadManyFromBuffer(
          req.files,
          "posts"
        );
        const imageAction = req.body.imageAction || "add";
        if (imageAction === "replace") {
          // Xóa tất cả hình ảnh cũ nếu có
          if (post.images && post.images.length > 0) {
            const publicIds = post.images
              .map((img) => img.publicId)
              .filter((id) => id && id.trim() !== "");
            if (publicIds.length > 0) {
              await cloudinaryService.deleteMany(publicIds);
            }
          }
          updateData.images = newImages;
        } else {
          // Thêm hình ảnh mới vào danh sách hiện tại
          updateData.images = [...(post.images || []), ...newImages];
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
        // Xóa tất cả hình ảnh
        if (post.images && post.images.length > 0) {
          const publicIds = post.images
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
          const publicIdsToRemove = post.images
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
          updateData.images = post.images.filter(
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

    // Cập nhật bài viết
    post = await Post.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error("Update post error:", {
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
 * /api/posts/{id}:
 *   delete:
 *     summary: Xóa bài viết
 *     tags: [Post]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bài viết
 *     responses:
 *       200:
 *         description: Xóa bài viết thành công
 *       403:
 *         description: Không có quyền xóa bài viết
 *       404:
 *         description: Không tìm thấy bài viết
 *       500:
 *         description: Lỗi server
 */
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    // Kiểm tra quyền: chỉ chủ bài viết (partner) hoặc admin được phép xóa
    if (post.userId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa bài viết này",
      });
    }

    // Xóa hình ảnh trên Cloudinary nếu có
    if (post.images && post.images.length > 0) {
      const publicIds = post.images
        .map((img) => img.publicId)
        .filter((id) => id && id.trim() !== "");
      if (publicIds.length > 0) {
        await cloudinaryService.deleteMany(publicIds);
      }
    }

    // Xóa bài viết và các tương tác liên quan
    await post.deleteOne();
    await PostInteraction.deleteMany({ postId: req.params.id });

    res.status(200).json({
      success: true,
      message: "Bài viết đã được xóa",
    });
  } catch (error) {
    console.error("Delete post error:", {
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
 * /api/posts/{id}/interactions:
 *   post:
 *     summary: Thêm tương tác cho bài viết
 *     tags: [Post]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bài viết
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 description: Loại tương tác (like, comment, ...)
 *               content:
 *                 type: string
 *                 description: Nội dung bình luận (nếu có)
 *     responses:
 *       201:
 *         description: Thêm tương tác thành công
 *       404:
 *         description: Không tìm thấy bài viết
 *       500:
 *         description: Lỗi server
 */
exports.addInteraction = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    req.body.postId = req.params.id;
    req.body.userId = req.user.id;

    const interaction = await PostInteraction.create(req.body);

    res.status(201).json({
      success: true,
      data: interaction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/posts/{id}/interactions:
 *   get:
 *     summary: Lấy danh sách tương tác của bài viết
 *     tags: [Post]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bài viết
 *     responses:
 *       200:
 *         description: Lấy danh sách tương tác thành công
 *       500:
 *         description: Lỗi server
 */
exports.getPostInteractions = async (req, res) => {
  try {
    const interactions = await PostInteraction.find({ postId: req.params.id })
      .populate("userId", "name email")
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      count: interactions.length,
      data: interactions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/posts/{postId}/interactions/{interactionId}:
 *   delete:
 *     summary: Xóa tương tác
 *     tags: [Post]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bài viết
 *       - in: path
 *         name: interactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID tương tác
 *     responses:
 *       200:
 *         description: Xóa tương tác thành công
 *       403:
 *         description: Không có quyền xóa tương tác
 *       404:
 *         description: Không tìm thấy tương tác
 *       500:
 *         description: Lỗi server
 */
exports.deleteInteraction = async (req, res) => {
  try {
    const interaction = await PostInteraction.findById(
      req.params.interactionId
    );

    if (!interaction) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tương tác",
      });
    }

    if (
      interaction.userId.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa tương tác này",
      });
    }

    await interaction.deleteOne();

    res.status(200).json({
      success: true,
      message: "Tương tác đã được xóa",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/uploads/tinymce:
 *   post:
 *     summary: Upload image for TinyMCE
 *     tags: [Post]
 *     responses:
 */
exports.uploadTinyMCEImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const image = await cloudinaryService.uploadFromBuffer(req.file, "posts");
    res.json({ location: image.url }); // TinyMCE expects { location: "url" }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
