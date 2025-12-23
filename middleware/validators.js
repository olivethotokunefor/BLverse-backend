const { check } = require('express-validator');

exports.registerValidator = [
  check('username', 'Username is required').not().isEmpty(),
  check('username', 'Username must be at least 3 characters').isLength({ min: 3 }),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 })
];

exports.loginValidator = [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
];

exports.profileValidator = [
  check('fullName', 'Full name is required').optional().not().isEmpty(),
  check('bio', 'Bio must be less than 500 characters').optional().isLength({ max: 500 }),
  check('location', 'Location must be less than 200 characters').optional().isLength({ max: 200 }),
  check('country', 'Country must be less than 100 characters').optional().isLength({ max: 100 }),
  check('favoriteDramas', 'favoriteDramas must be an array').optional().isArray(),
  check('favoriteShips', 'favoriteShips must be an array').optional().isArray()
];
