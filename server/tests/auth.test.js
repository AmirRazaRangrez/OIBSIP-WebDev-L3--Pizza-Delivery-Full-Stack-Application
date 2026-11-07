const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const app = require('../server');
const User = require('../models/User');

// Mock email service to prevent attempting outbound network calls
jest.mock('../services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

describe('Auth & Admin Isolation Suite (M1)', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with isVerified: false and role: user', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message');

      const user = await User.findOne({ email: 'john@example.com' });
      expect(user).not.toBeNull();
      expect(user.isVerified).toBe(false);
      expect(user.role).toBe('user');
      expect(user.verificationToken).toBeDefined();
    });

    it('should block privilege escalation (ignoring role: admin parameter)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Hacker',
        email: 'hacker@example.com',
        password: 'Password123!',
        role: 'admin',
      });

      expect(res.status).toBe(201);
      const user = await User.findOne({ email: 'hacker@example.com' });
      expect(user.role).toBe('user'); // Enforces isolation
    });

    it('should reject registration if email is already registered', async () => {
      await User.create({
        name: 'Existing User',
        email: 'existing@example.com',
        password: 'Password123!',
        isVerified: true
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Existing Duplicate',
        email: 'existing@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });
  });

  describe('GET /api/auth/verify-email', () => {
    it('should verify email with valid token', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      await User.create({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Password123!',
        isVerified: false,
        verificationToken: token,
      });

      const res = await request(app).get(`/api/auth/verify-email?token=${token}`);
      expect(res.status).toBe(200);

      const updated = await User.findOne({ email: 'jane@example.com' });
      expect(updated.isVerified).toBe(true);
      expect(updated.verificationToken).toBeNull();
    });

    it('should reject invalid or expired verification token', async () => {
      const res = await request(app).get('/api/auth/verify-email?token=invalid_token_12345');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid or expired/i);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject unverified user', async () => {
      const salt = await bcrypt.genSalt(10);
      const password = await bcrypt.hash('Password123!', salt);
      await User.create({
        name: 'Unverified',
        email: 'unverified@example.com',
        password,
        isVerified: false,
      });

      const res = await request(app).post('/api/auth/login').send({
        email: 'unverified@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/verify/i);
    });

    it('should reject invalid password', async () => {
      const salt = await bcrypt.genSalt(10);
      const password = await bcrypt.hash('Password123!', salt);
      await User.create({
        name: 'Valid User',
        email: 'valid@example.com',
        password,
        isVerified: true,
      });

      const res = await request(app).post('/api/auth/login').send({
        email: 'valid@example.com',
        password: 'WrongPassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it('should allow verified user and return JWT', async () => {
      const salt = await bcrypt.genSalt(10);
      const password = await bcrypt.hash('Password123!', salt);
      await User.create({
        name: 'Verified User',
        email: 'verified@example.com',
        password,
        isVerified: true,
      });

      const res = await request(app).post('/api/auth/login').send({
        email: 'verified@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.role).toBe('user');
    });
  });

  describe('POST /api/admin/auth/login', () => {
    it('should reject regular user with 403 Forbidden', async () => {
      const salt = await bcrypt.genSalt(10);
      const password = await bcrypt.hash('Password123!', salt);
      await User.create({
        name: 'Regular Customer',
        email: 'regular@example.com',
        password,
        role: 'user',
        isVerified: true,
      });

      const res = await request(app).post('/api/admin/auth/login').send({
        email: 'regular@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/access denied|restricted/i);
    });

    it('should allow admin user and return JWT', async () => {
      const salt = await bcrypt.genSalt(10);
      const password = await bcrypt.hash('Admin@12345', salt);
      await User.create({
        name: 'System Admin',
        email: 'admin@pizzadelivery.com',
        password,
        role: 'admin',
        isVerified: true,
      });

      const res = await request(app).post('/api/admin/auth/login').send({
        email: 'admin@pizzadelivery.com',
        password: 'Admin@12345',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.admin.role).toBe('admin');
    });
  });

  describe('Forgot and Reset Password Flow', () => {
    it('should handle forgot password and reset password successfully', async () => {
      const user = await User.create({
        name: 'Reset Target',
        email: 'resettarget@example.com',
        password: 'OldPassword123!',
        isVerified: true,
      });

      const forgotRes = await request(app).post('/api/auth/forgot-password').send({
        email: 'resettarget@example.com',
      });
      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.message).toMatch(/reset link sent/i);

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.resetPasswordToken).toBeDefined();

      const resetRes = await request(app).post('/api/auth/reset-password').send({
        token: updatedUser.resetPasswordToken,
        newPassword: 'BrandNewPassword123!',
      });
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toMatch(/password updated successfully/i);

      // Verify login with new password
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'resettarget@example.com',
        password: 'BrandNewPassword123!',
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body).toHaveProperty('token');
    });
  });
});
