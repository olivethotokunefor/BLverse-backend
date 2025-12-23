const User = require('../models/User');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Search users by username or profile fields
// @route   GET /api/users/search?q=
// @access  Private
exports.searchUsers = async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();

    if (!q) {
      return res.json([]);
    }

    const regex = new RegExp(q, 'i');

    const users = await User.find({
      $or: [
        { username: regex },
        { 'profile.fullName': regex },
        { 'profile.location': regex },
      ],
    })
      .select('-password')
      .limit(20);

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ message: 'Invalid user identifier' });
    }
    let user = null;

    if (mongoose.isValidObjectId(id)) {
      user = await User.findById(id).select('-password');
    } else {
      // If not a valid ObjectId, attempt lookup by username
      user = await User.findOne({ username: id }).select('-password');
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    let { fullName, bio, location, avatar, country, favoriteDramas, favoriteShips } = req.body;
    // Coerce favorites if sent as comma-separated strings
    if (typeof favoriteDramas === 'string') {
      favoriteDramas = favoriteDramas
        .split(',')
        .map((t) => String(t).trim())
        .filter(Boolean);
    }
    if (typeof favoriteShips === 'string') {
      favoriteShips = favoriteShips
        .split(',')
        .map((t) => String(t).trim())
        .filter(Boolean);
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const existing = user.profile || {};
    user.profile = {
      fullName: fullName ?? existing.fullName,
      bio: bio ?? existing.bio,
      location: location ?? existing.location,
      avatar: avatar ?? existing.avatar,
      country: country ?? existing.country,
      favoriteDramas: Array.isArray(favoriteDramas) ? favoriteDramas : (existing.favoriteDramas || []),
      favoriteShips: Array.isArray(favoriteShips) ? favoriteShips : (existing.favoriteShips || [])
    };
    
    user.updatedAt = Date.now();
    
    const updatedUser = await user.save();
    
    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      profile: updatedUser.profile,
      role: updatedUser.role
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user is admin or the account owner
    if (user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    await user.remove();
    
    res.json({ message: 'User removed' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
