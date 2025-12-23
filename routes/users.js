const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { profileValidator } = require('../middleware/validators');
const {
  getUsers,
  getUserById,
  updateProfile,
  deleteUser,
  searchUsers,
} = require('../controllers/userController');
const { trackProfileView } = require('../controllers/notificationsController');

// Protected routes
router.use(protect);

// User profile routes
router.route('/profile')
  .put(profileValidator, updateProfile);

// User search
router.get('/search', searchUsers);

// Track profile views (named viewers)
router.post('/:id/profile-view', trackProfileView);

router.route('/:id')
  .get(getUserById);

// Admin routes
router.use(admin);

router.route('/')
  .get(getUsers);

router.route('/:id')
  .delete(deleteUser);

module.exports = router;
