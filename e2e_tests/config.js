// e2e_tests/config.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  baseUrl: process.env.BASE_URL || 'http://localhost:5000',
  wsUrl: process.env.WS_URL || 'ws://localhost:5000',
  testMode: process.env.TEST_MODE || 'mock', // 'live' or 'mock'
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_Twlntm5UkURGg0',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || 'FXnUylflZOnGsE4zoexrkIuv',
  jwtSecret: process.env.JWT_SECRET || 'pizza_super_secret_jwt_key_2026',
  projectRoot: path.resolve(__dirname, '..'),
  themeCssPath: path.resolve(__dirname, '../client/src/styles/theme.css'),
  adminCredentials: {
    email: 'admin@pizzadelivery.com',
    password: 'AdminPassword123!'
  }
};

export default config;

