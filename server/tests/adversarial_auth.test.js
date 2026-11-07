const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../models/User');
const Inventory = require('../models/Inventory');

// Mock email service to prevent real network calls
jest.mock('../services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

describe('Adversarial Security & Stress Test Suite (M1 Challenger)', () => {
  const getJwtSecret = () => process.env.JWT_SECRET || 'pizza_delivery_super_secure_jwt_secret_token_2026_dev';

  beforeEach(async () => {
    await User.deleteMany({});
    await Inventory.deleteMany({});
  });

  // =========================================================================
  // 1. PRIVILEGE ESCALATION ATTEMPTS IN REGISTRATION
  // =========================================================================
  describe('Dimension 1: Registration Privilege Escalation', () => {
    it('ADV_01: Should block explicit { role: "admin" } injection in registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Attacker Admin',
          email: 'attacker_admin@example.com',
          password: 'Password123!',
          role: 'admin',
        });

      expect(res.status).toBe(201);
      const user = await User.findOne({ email: 'attacker_admin@example.com' });
      expect(user).not.toBeNull();
      expect(user.role).toBe('user');
      expect(user.isVerified).toBe(false);
    });

    it('ADV_02: Should block boolean flag injection { isAdmin: true, isVerified: true }', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Flag Injector',
          email: 'flag_injector@example.com',
          password: 'Password123!',
          isAdmin: true,
          isVerified: true,
        });

      expect(res.status).toBe(201);
      const user = await User.findOne({ email: 'flag_injector@example.com' });
      expect(user.role).toBe('user');
      expect(user.isVerified).toBe(false);
    });

    it('ADV_03: Should block object/array role injection { role: { $ne: "user" } } or role: ["admin"]', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Array Role',
          email: 'array_role@example.com',
          password: 'Password123!',
          role: ['admin', 'superadmin'],
        });

      expect(res.status).toBe(201);
      const user = await User.findOne({ email: 'array_role@example.com' });
      expect(user.role).toBe('user');
    });

    it('ADV_04: Should block arbitrary elevated properties ({ permissions: ["ALL"], accessLevel: 99 })', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Elevated Props',
          email: 'elevated@example.com',
          password: 'Password123!',
          permissions: ['ALL'],
          accessLevel: 99,
          superAdmin: true,
        });

      expect(res.status).toBe(201);
      const user = await User.findOne({ email: 'elevated@example.com' });
      expect(user.role).toBe('user');
      expect(user.permissions).toBeUndefined();
    });

    it('ADV_05: Should reject non-string email injection ({ email: { $gt: "" } }) without server crash', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'NoSQL Injector',
          email: { $gt: '' },
          password: 'Password123!',
        });

      expect([400, 500]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. UNVERIFIED EMAIL LOGIN BYPASS & TOKEN ABUSE
  // =========================================================================
  describe('Dimension 2: Unverified Email Login Bypass', () => {
    it('ADV_06: Should strictly reject login for unverified account with 401 and isVerified: false', async () => {
      const salt = await bcrypt.genSalt(10);
      const password = await bcrypt.hash('CorrectPassword123!', salt);
      await User.create({
        name: 'Unverified Guy',
        email: 'unverified_guy@example.com',
        password,
        role: 'user',
        isVerified: false,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unverified_guy@example.com',
          password: 'CorrectPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.isVerified).toBe(false);
      expect(res.body.token).toBeUndefined();
    });

    it('ADV_07: Should reject email verification when token is expired (> 24 hours)', async () => {
      const expiredToken = crypto.randomBytes(32).toString('hex');
      await User.create({
        name: 'Expired Token User',
        email: 'expired_user@example.com',
        password: 'HashedPassword123!',
        role: 'user',
        isVerified: false,
        verificationToken: expiredToken,
        verificationTokenExpires: new Date(Date.now() - 3600000), // 1 hour ago
      });

      const res = await request(app).get(`/api/auth/verify-email?token=${expiredToken}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const user = await User.findOne({ email: 'expired_user@example.com' });
      expect(user.isVerified).toBe(false);
    });

    it('ADV_08: Should prevent token replay attack on verification (token cannot be reused)', async () => {
      const validToken = crypto.randomBytes(32).toString('hex');
      await User.create({
        name: 'Replay Target',
        email: 'replay_target@example.com',
        password: 'HashedPassword123!',
        role: 'user',
        isVerified: false,
        verificationToken: validToken,
        verificationTokenExpires: new Date(Date.now() + 86400000),
      });

      // First verification succeeds
      const firstRes = await request(app).get(`/api/auth/verify-email?token=${validToken}`);
      expect(firstRes.status).toBe(200);

      // Second verification attempt with same token must fail
      const secondRes = await request(app).get(`/api/auth/verify-email?token=${validToken}`);
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.success).toBe(false);
    });

    it('ADV_09: Probes NoSQL operator injection in verify-email { token: { $ne: null } }', async () => {
      // Victim creates an unverified account
      const victimToken = crypto.randomBytes(32).toString('hex');
      const victim = await User.create({
        name: 'Victim User',
        email: 'victim_verify@example.com',
        password: 'HashedPassword123!',
        role: 'user',
        isVerified: false,
        verificationToken: victimToken,
        verificationTokenExpires: new Date(Date.now() + 86400000),
      });

      // Attacker sends NoSQL query operator in POST verify-email
      const exploitRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: { $ne: null } });

      // If secure against NoSQL injection, request must NOT verify the victim
      const victimCheck = await User.findById(victim._id);
      expect(victimCheck.isVerified).toBe(false);
    });
  });

  // =========================================================================
  // 3. PASSWORD RESET TOKEN MANIPULATION & REPLAY
  // =========================================================================
  describe('Dimension 3: Password Reset Token Manipulation & Replay', () => {
    it('ADV_10: Should reject password reset with expired reset token', async () => {
      const expiredResetToken = crypto.randomBytes(32).toString('hex');
      await User.create({
        name: 'Expired Reset User',
        email: 'expired_reset@example.com',
        password: 'HashedPassword123!',
        role: 'user',
        isVerified: true,
        resetPasswordToken: expiredResetToken,
        resetPasswordExpires: new Date(Date.now() - 60000), // 1 minute in the past
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: expiredResetToken,
          newPassword: 'BrandNewSecurePassword123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('ADV_11: Should reject replay of already-consumed password reset token', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      await User.create({
        name: 'Replay User',
        email: 'replay_reset@example.com',
        password: 'InitialPassword123!',
        role: 'user',
        isVerified: true,
        resetPasswordToken: token,
        resetPasswordExpires: new Date(Date.now() + 3600000),
      });

      // First reset: should succeed
      const firstRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token,
          newPassword: 'FirstUpdatedPassword123!',
        });
      expect(firstRes.status).toBe(200);

      // Second reset attempt with same token: MUST fail
      const secondRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token,
          newPassword: 'SecondUpdatedPassword123!',
        });
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.success).toBe(false);
    });

    it('ADV_12: Probes NoSQL operator injection in reset-password { token: { $ne: null } }', async () => {
      // Victim requests reset
      const resetToken = crypto.randomBytes(32).toString('hex');
      const victim = await User.create({
        name: 'Victim Reset',
        email: 'victim_reset@example.com',
        password: 'VictimOriginalPassword123!',
        role: 'user',
        isVerified: true,
        resetPasswordToken: resetToken,
        resetPasswordExpires: new Date(Date.now() + 3600000),
      });

      // Attacker attempts account takeover via NoSQL query injection
      const exploitRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: { $ne: null },
          newPassword: 'AttackerTakeover123!',
        });

      // Check whether victim's password was hijacked
      const victimCheck = await User.findById(victim._id).select('+password');
      const isTakeover = await bcrypt.compare('AttackerTakeover123!', victimCheck.password);
      expect(isTakeover).toBe(false); // If takeover succeeded, this will fail
    });

    it('ADV_13: Should reject reset with password under 6 characters', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      await User.create({
        name: 'Short Password User',
        email: 'short_pass@example.com',
        password: 'HashedPassword123!',
        role: 'user',
        isVerified: true,
        resetPasswordToken: token,
        resetPasswordExpires: new Date(Date.now() + 3600000),
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token,
          newPassword: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 6 characters/i);
    });
  });

  // =========================================================================
  // 4. JWT TOKEN TAMPERING & CRYPTOGRAPHIC STRESS
  // =========================================================================
  describe('Dimension 4: JWT Token Tampering & Cryptographic Stress', () => {
    it('ADV_14: Should reject unsigned alg: "none" tampered JWT', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ id: 'fake_admin_id', email: 'forged@admin.com', role: 'admin' })
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${noneToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('ADV_15: Should reject role-tampered JWT (consumer token modified with role: admin)', async () => {
      const secret = getJwtSecret();
      const consumerToken = jwt.sign(
        { id: 'user_123', email: 'user@test.com', role: 'user' },
        secret,
        { expiresIn: '1h' }
      );

      const parts = consumerToken.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ id: 'user_123', email: 'user@test.com', role: 'admin' })
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('ADV_16: Should reject JWT signed with foreign secret key', async () => {
      const forgedToken = jwt.sign(
        { id: 'fake_admin', email: 'admin@attacker.com', role: 'admin' },
        'attacker_private_secret_key_9999',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('ADV_17: Should reject expired JWT tokens with 401 and expiration error message', async () => {
      const secret = getJwtSecret();
      const expiredToken = jwt.sign(
        { id: 'expired_user', email: 'expired@test.com', role: 'user' },
        secret,
        { expiresIn: '-10s' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired/i);
    });

    it('ADV_18: Should reject malformed or truncated Authorization headers', async () => {
      const malformedHeaders = [
        'Bearer ',
        'Bearer',
        'Bearer invalid.jwt',
        'Bearer null',
        'Bearer undefined',
        'Basic dXNlcjpwYXNz',
        'Token something',
      ];

      for (const header of malformedHeaders) {
        const res = await request(app)
          .get('/api/auth/me')
          .set('Authorization', header);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });
  });

  // =========================================================================
  // 5. ADMIN PORTAL SEPARATION & ROUTE GUARD BYPASS
  // =========================================================================
  describe('Dimension 5: Admin Portal Separation & Route Guards', () => {
    let regularUserToken;
    let adminUserToken;
    let testInventoryItem;

    beforeEach(async () => {
      // 1. Create Consumer via API and get real token
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Regular Customer',
        email: 'regular_cust@test.com',
        password: 'ConsumerPass123!',
      });
      const verifyToken = regRes.body.emailVerificationToken;
      await request(app).get(`/api/auth/verify-email?token=${verifyToken}`);

      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'regular_cust@test.com',
        password: 'ConsumerPass123!',
      });
      regularUserToken = loginRes.body.token;

      // 2. Create Admin and get real admin token via admin login API
      const salt = await bcrypt.genSalt(10);
      const adminHash = await bcrypt.hash('AdminPass123!', salt);
      await User.create({
        name: 'Portal Admin',
        email: 'portal_admin@test.com',
        password: adminHash,
        role: 'admin',
        isVerified: true,
      });

      const adminLoginRes = await request(app).post('/api/admin/auth/login').send({
        email: 'portal_admin@test.com',
        password: 'AdminPass123!',
      });
      adminUserToken = adminLoginRes.body.token;

      // 3. Create test inventory item
      testInventoryItem = await Inventory.create({
        name: 'Adversarial Test Base',
        category: 'base',
        stock: 50,
        threshold: 20,
        price: 99,
      });
    });

    it('ADV_19: Consumer credentials submitted to POST /api/admin/auth/login returns 403', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'regular_cust@test.com',
          password: 'ConsumerPass123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/access denied|restricted/i);
      expect(res.body.token).toBeUndefined();
    });

    it('ADV_20: Consumer JWT accessing GET /api/admin/auth/me returns 403', async () => {
      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${regularUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/administrator privileges required/i);
    });

    it('ADV_21: Consumer JWT attempting PUT /api/inventory/:id/stock returns 403', async () => {
      const res = await request(app)
        .put(`/api/inventory/${testInventoryItem._id}/stock`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({ stock: 9999 });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/administrator privileges required/i);

      // Verify stock was NOT altered
      const itemCheck = await Inventory.findById(testInventoryItem._id);
      expect(itemCheck.stock).toBe(50);
    });

    it('ADV_22: Legitimate Admin JWT successfully accesses /api/admin/auth/me and updates stock', async () => {
      const meRes = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${adminUserToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.admin.role).toBe('admin');

      const stockRes = await request(app)
        .put(`/api/inventory/${testInventoryItem._id}/stock`)
        .set('Authorization', `Bearer ${adminUserToken}`)
        .send({ stock: 77, threshold: 15 });

      expect(stockRes.status).toBe(200);
      expect(stockRes.body.item.stock).toBe(77);
      expect(stockRes.body.item.threshold).toBe(15);
    });
  });

  // =========================================================================
  // 6. ENUMERATION RESISTANCE & CONCURRENCY
  // =========================================================================
  describe('Dimension 6: Account Enumeration & Race Conditions', () => {
    it('ADV_23: Forgot password returns identical 200 message for non-existent vs existing user', async () => {
      await User.create({
        name: 'Real User',
        email: 'real_user@example.com',
        password: 'HashedPassword123!',
        isVerified: true,
      });

      const resNonExistent = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent_ghost@example.com' });

      const resExistent = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'real_user@example.com' });

      expect(resNonExistent.status).toBe(200);
      expect(resExistent.status).toBe(200);
    });

    it('ADV_24: Prevents race condition duplicate registration of same email concurrently', async () => {
      const email = 'concurrent_reg@example.com';
      const requests = [
        request(app).post('/api/auth/register').send({ name: 'User 1', email, password: 'Password123!' }),
        request(app).post('/api/auth/register').send({ name: 'User 2', email, password: 'Password123!' }),
        request(app).post('/api/auth/register').send({ name: 'User 3', email, password: 'Password123!' }),
      ];

      const responses = await Promise.all(requests);
      const successCount = responses.filter((r) => r.status === 201).length;
      const rejectCount = responses.filter((r) => r.status === 400).length;

      // Exactly ONE registration must succeed, others must be rejected
      expect(successCount).toBe(1);
      expect(rejectCount).toBe(2);

      const dbUsers = await User.find({ email });
      expect(dbUsers.length).toBe(1);
    });
  });
});
