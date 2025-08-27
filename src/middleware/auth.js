const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[AUTH] Missing or malformed Authorization header');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[AUTH] Token verified for userId:', decoded.userId);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      console.warn('[AUTH] User not found for userId:', decoded.userId);
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    console.log('[AUTH] User attached to request:', { id: user.id, email: user.email });
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      console.warn('[AUTH] Invalid token');
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      console.warn('[AUTH] Token expired');
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('[AUTH] Unexpected error:', error);
    next(error);
  }
};

const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};

module.exports = {
  authenticateJWT,
  generateToken
};
