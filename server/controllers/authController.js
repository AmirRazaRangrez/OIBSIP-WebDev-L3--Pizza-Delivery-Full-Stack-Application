const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const emailService = require('../services/emailService');

// Cache of recently verified tokens for idempotency across duplicate clicks / React StrictMode
const recentlyVerifiedTokens = new Set();

// Helper to sign user JWT token
const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET || 'pizza_delivery_super_secure_jwt_secret_token_2026_dev',
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

/**
 * @desc    Register a new consumer user account
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate inputs
    if (
      !name ||
      typeof name !== 'string' ||
      name.trim() === '' ||
      !email ||
      typeof email !== 'string' ||
      email.trim() === '' ||
      !password ||
      typeof password !== 'string' ||
      password.trim() === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // 2. Check duplicate email (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      if (!existingUser.isVerified) {
        // User registered but has not verified yet: refresh token and allow instant verification
        existingUser.name = name.trim();
        existingUser.password = password;
        const verificationToken = existingUser.generateVerificationToken();
        await existingUser.save();
        emailService.sendVerificationEmail(existingUser.email, existingUser.name, verificationToken).catch(err => {
          console.warn('[Register] Background email dispatch notice:', err.message);
        });

        return res.status(200).json({
          success: true,
          message: 'Account registered! Click the verification link below to activate and proceed to login.',
          userId: existingUser._id,
          emailVerificationToken: verificationToken
        });
      }

      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    // 3. Create user - CRITICAL DEFENSE: strictly enforce role: 'user'
    // Even if client attempts to pass role: 'admin', it is ignored
    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'user', // Forced consumer role
      isVerified: false
    });

    // 4. Generate email verification token (24h)
    const verificationToken = user.generateVerificationToken();
    await user.save();

    // 5. Send verification email asynchronously in background without blocking HTTP response
    emailService.sendVerificationEmail(user.email, user.name, verificationToken).catch(err => {
      console.warn('[Register] Background email dispatch notice:', err.message);
    });

    // 6. Return response
    return res.status(201).json({
      success: true,
      message: 'Registration successful! Please verify your account to proceed.',
      userId: user._id,
      emailVerificationToken: verificationToken
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend verification email or retrieve token
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'This email is already verified. Please sign in.'
      });
    }

    const token = user.generateVerificationToken();
    await user.save();
    emailService.sendVerificationEmail(user.email, user.name, token).catch(err => {
      console.warn('[Resend] Background email dispatch notice:', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Fresh verification link generated successfully!',
      emailVerificationToken: token
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify email using token from link
 * @route   GET /api/auth/verify-email (also accepts POST with { token })
 * @access  Public
 */
exports.verifyEmail = async (req, res, next) => {
  try {
    const token = req.query.token || (req.body && req.body.token);

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required and must be a valid string'
      });
    }

    const cleanToken = token.trim();

    // Find user with matching token and valid or unset expiration
    const user = await User.findOne({
      verificationToken: cleanToken,
      $or: [
        { verificationTokenExpires: { $gt: Date.now() } },
        { verificationTokenExpires: null }
      ]
    });

    if (!user) {
      if (process.env.NODE_ENV !== 'test' && recentlyVerifiedTokens.has(cleanToken)) {
        return res.status(200).json({
          success: true,
          message: 'Email verified successfully! You can now log in.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    // Activate user and clear tokens
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    // Cache token for idempotency across duplicate clicks and React StrictMode mounts
    recentlyVerifiedTokens.add(cleanToken);
    setTimeout(() => recentlyVerifiedTokens.delete(cleanToken), 15 * 60 * 1000);

    // Broadcast realtime event so open registration / login windows reflect verification immediately
    const io = req.io || (req.app && req.app.get('io'));
    if (io) {
      io.emit('email_verified', {
        email: user.email,
        name: user.name,
        userId: user._id
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully! You can now log in.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Consumer user login
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res, next) => {
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
        message: 'Please provide email and password'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently connecting. Please wait a few seconds or verify MONGODB_URI.'
      });
    }

    // Query user and explicitly select password field
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password hash
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // CRITICAL ENFORCEMENT: Email must be verified before login
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the activation link.',
        isVerified: false
      });
    }

    // Issue JWT token
    const token = signToken(user);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Request password reset email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || email.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Anti-enumeration protection: respond with success even if user not found
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    // Generate reset token (1 hour)
    const resetToken = user.generateResetPasswordToken();
    await user.save();

    // Send reset email asynchronously
    emailService.sendPasswordResetEmail(user.email, user.name, resetToken).catch(err => {
      console.warn('[ForgotPassword] Background email dispatch notice:', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Reset link sent',
      resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using reset token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (
      !token ||
      typeof token !== 'string' ||
      token.trim() === '' ||
      !newPassword ||
      typeof newPassword !== 'string' ||
      newPassword.trim() === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required and must be valid strings'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const cleanToken = token.trim();

    const user = await User.findOne({
      resetPasswordToken: cleanToken,
      $or: [
        { resetPasswordExpires: { $gt: Date.now() } },
        { resetPasswordExpires: null }
      ]
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token'
      });
    }

    // Update password (triggers pre-save bcrypt hook) and clear reset token
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully! You can now log in.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently logged in user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};
