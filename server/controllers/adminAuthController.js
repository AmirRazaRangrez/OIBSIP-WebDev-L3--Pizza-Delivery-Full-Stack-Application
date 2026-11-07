const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signAdminToken = (adminUser) => {
  return jwt.sign(
    {
      id: adminUser._id,
      email: adminUser.email,
      role: 'admin'
    },
    process.env.JWT_SECRET || 'pizza_delivery_super_secure_jwt_secret_token_2026_dev',
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
};

/**
 * @desc    Dedicated isolated admin login
 * @route   POST /api/admin/auth/login
 * @access  Public (Isolated endpoint)
 */
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (
      !email ||
      typeof email !== 'string' ||
      email.trim() === '' ||
      !password ||
      typeof password !== 'string' ||
      password.trim() === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide admin email and password'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    // 1. Credential check
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials'
      });
    }

    // 2. CRITICAL ISOLATION CHECK: Must have role === 'admin'
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This portal is strictly restricted to administrator accounts.'
      });
    }

    // 3. Issue Admin JWT
    const token = signAdminToken(user);

    return res.status(200).json({
      success: true,
      token,
      admin: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: 'admin'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify active admin session
 * @route   GET /api/admin/auth/me
 * @access  Private (Admin only)
 */
exports.getAdminMe = async (req, res, next) => {
  try {
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Administrator privileges required.'
      });
    }

    return res.status(200).json({
      success: true,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
};
