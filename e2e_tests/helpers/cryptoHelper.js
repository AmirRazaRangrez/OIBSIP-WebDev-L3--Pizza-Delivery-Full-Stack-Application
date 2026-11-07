// e2e_tests/helpers/cryptoHelper.js
import crypto from 'node:crypto';
import { config } from '../config.js';

export function generateRazorpaySignature(razorpayOrderId, razorpayPaymentId, secret = config.razorpayKeySecret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

export function generateRandomEmail(prefix = 'testuser') {
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${Date.now()}_${randomSuffix}@example.com`;
}

export function generateRandomPassword(length = 12) {
  return `P@ss${crypto.randomBytes(length).toString('base64').slice(0, length)}1!`;
}

export function createTestJwt(payload, secret = config.jwtSecret, expiresInSeconds = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  return `${b64Header}.${b64Payload}.${signature}`;
}

export function verifyJwt(token, secret = config.jwtSecret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [b64Header, b64Payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const payloadJson = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

