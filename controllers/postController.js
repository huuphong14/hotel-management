const Post = require('../models/Post');
const PostInteraction = require('../models/PostInteraction');

// @desc    Tạo bài viết mới
// @route   POST /api/posts
// @access  Private
exports.createPost = async (req, res) => {
  try {
    req.body.userId = req.user.id;
    const post = await Post.create(req.body);

    res.status(201).json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách bài viết
// @route   GET /api/posts
// @access  Public
exports.getPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('userId', 'name email')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: posts.length,
      data: posts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy chi tiết bài viết
// @route   GET /api/posts/:id
// @access  Public
exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('userId', 'name email');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết'
      });
    }

    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Cập nhật bài viết
// @route   PUT /api/posts/:id
// @access  Private
exports.updatePost = async (req, res) => {
  try {
    let post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết'
      });
    }

    if (post.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật bài viết này'
      });
    }

    post = await Post.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Xóa bài viết
// @route   DELETE /api/posts/:id
// @access  Private
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết'
      });
    }

    if (post.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa bài viết này'
      });
    }

    await post.deleteOne();
    await PostInteraction.deleteMany({ postId: req.params.id });

    res.status(200).json({
      success: true,
      message: 'Bài viết đã được xóa'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Thêm tương tác
// @route   POST /api/posts/:id/interactions
// @access  Private
exports.addInteraction = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài viết'
      });
    }

    req.body.postId = req.params.id;
    req.body.userId = req.user.id;

    const interaction = await PostInteraction.create(req.body);

    res.status(201).json({
      success: true,
      data: interaction
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Lấy danh sách tương tác của bài viết
// @route   GET /api/posts/:id/interactions
// @access  Public
exports.getPostInteractions = async (req, res) => {
  try {
    const interactions = await PostInteraction.find({ postId: req.params.id })
      .populate('userId', 'name email')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: interactions.length,
      data: interactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// @desc    Xóa tương tác
// @route   DELETE /api/posts/:postId/interactions/:interactionId
// @access  Private
exports.deleteInteraction = async (req, res) => {
  try {
    const interaction = await PostInteraction.findById(req.params.interactionId);

    if (!interaction) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tương tác'
      });
    }

    if (interaction.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa tương tác này'
      });
    }

    await interaction.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Tương tác đã được xóa'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
}; 