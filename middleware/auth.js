const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
exports.protect = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // MUST have id here
    next();
  } catch (err) {
    console.log('Protect middleware error:', err);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Admin Middleware
exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
};
