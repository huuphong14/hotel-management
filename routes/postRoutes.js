const express = require('express');
const {
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
  addInteraction,
  getPostInteractions,
  deleteInteraction
} = require('../controllers/postController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

// Public routes
router.get('/', getPosts);
router.get('/:id', getPost);
router.get('/:id/interactions', getPostInteractions);

// Protected routes
router.use(protect);
router.post('/', createPost);
router.put('/:id', updatePost);
router.delete('/:id', deletePost);

// Interaction routes
router.post('/:id/interactions', addInteraction);
router.delete('/:postId/interactions/:interactionId', deleteInteraction);

module.exports = router; 