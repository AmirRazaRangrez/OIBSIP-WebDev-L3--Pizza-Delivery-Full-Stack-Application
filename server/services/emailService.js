const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.sentEmails = []; // Test spy store
    this.initTransporter();
  }

  initTransporter() {
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.EMAIL_MOCK === 'true';

    if (isTestMode) {
      // Mock transporter for unit & integration testing
      this.transporter = {
        sendMail: async (mailOptions) => {
          this.sentEmails.push({
            ...mailOptions,
            sentAt: new Date()
          });
          return {
            messageId: `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            accepted: [mailOptions.to],
            response: '250 Mock Email Accepted'
          };
        }
      };
    } else {
      // Clean app password (stripping whitespace if present)
      const rawPassword = process.env.EMAIL_PASS || 'wvoz fyxc nutg ilni';
      const cleanPassword = rawPassword.replace(/\s+/g, '');
      const port = parseInt(process.env.EMAIL_PORT, 10) || 587;

      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: port,
        secure: port === 465, // true for 465 SSL, false for 587 STARTTLS
        connectionTimeout: 4000, // 4-second fail-fast timeout
        greetingTimeout: 4000,
        socketTimeout: 5000,
        auth: {
          user: process.env.EMAIL_USER || 'amirrazarangrez56@gmail.com',
          pass: cleanPassword
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    }
  }

  getSentEmails() {
    return this.sentEmails;
  }

  getLastSentEmail() {
    return this.sentEmails[this.sentEmails.length - 1] || null;
  }

  clearSentEmails() {
    this.sentEmails = [];
  }

  async sendMail(options) {
    const fromAddress = process.env.EMAIL_FROM || `"Pizza Delivery" <${process.env.EMAIL_USER || 'no-reply@pizzadelivery.com'}>`;
    const mailOptions = {
      from: fromAddress,
      ...options
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      return result;
    } catch (error) {
      console.error('[EmailService] Dispatch error:', error.message);
      if (process.env.NODE_ENV === 'test') {
        throw error;
      }
      return { error: error.message };
    }
  }

  async sendVerificationEmail(email, name, token) {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const verificationUrl = `${clientUrl}/verify-email?token=${token}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          .header { background: #e63946; padding: 24px; text-align: center; color: #ffffff; }
          .content { padding: 32px 24px; color: #212529; line-height: 1.6; }
          .btn { display: inline-block; background: #e63946; color: #ffffff !important; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0; }
          .footer { background: #f1f3f5; padding: 16px; text-align: center; font-size: 12px; color: #6c757d; }
          .token-box { background: #e9ecef; padding: 10px; border-radius: 4px; font-family: monospace; word-break: break-all; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0; font-size: 24px;">🍕 Pizza Delivery</h1>
          </div>
          <div class="content">
            <h2>Welcome, ${name}!</h2>
            <p>Thank you for joining Pizza Delivery. Please confirm your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="btn" target="_blank">Verify Email Address</a>
            </p>
            <p>Or paste this link into your browser:</p>
            <div class="token-box">${verificationUrl}</div>
            <p><small>This verification link will expire in 24 hours.</small></p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Pizza Delivery Inc. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({
      to: email,
      subject: 'Verify Your Email Address — Pizza Delivery',
      html: htmlContent,
      text: `Welcome ${name}! Please verify your email by opening: ${verificationUrl}`
    });
  }

  async sendPasswordResetEmail(email, name, token) {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${clientUrl}/reset-password?token=${token}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          .header { background: #e63946; padding: 24px; text-align: center; color: #ffffff; }
          .content { padding: 32px 24px; color: #212529; line-height: 1.6; }
          .btn { display: inline-block; background: #e63946; color: #ffffff !important; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0; }
          .footer { background: #f1f3f5; padding: 16px; text-align: center; font-size: 12px; color: #6c757d; }
          .token-box { background: #e9ecef; padding: 10px; border-radius: 4px; font-family: monospace; word-break: break-all; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0; font-size: 24px;">🍕 Pizza Delivery</h1>
          </div>
          <div class="content">
            <h2>Hello, ${name}</h2>
            <p>You recently requested to reset your password for your Pizza Delivery account. Click the button below to choose a new password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
            </p>
            <p>Or paste this link into your browser:</p>
            <div class="token-box">${resetUrl}</div>
            <p><small>This password reset link is valid for 1 hour only. If you did not request this, you can safely ignore this email.</small></p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Pizza Delivery Inc. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({
      to: email,
      subject: 'Reset Your Password — Pizza Delivery',
      html: htmlContent,
      text: `Hello ${name}. Reset your password by opening: ${resetUrl}`
    });
  }
}

module.exports = new EmailService();
