const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.sentEmails = []; // Test spy store
    this.smtpReady = false;
    this.lastError = null;
    this.initTransporter();
  }

  initTransporter() {
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.EMAIL_MOCK === 'true';
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (isTestMode || !emailUser || !emailPass) {
      if (!isTestMode && (!emailUser || !emailPass)) {
        console.warn('[EmailService] SMTP credentials (EMAIL_USER / EMAIL_PASS) not set in environment. Running in mock console dispatch mode.');
      }
      // Mock transporter for testing and development without live SMTP credentials
      this.transporter = {
        sendMail: async (mailOptions) => {
          this.sentEmails.push({
            ...mailOptions,
            sentAt: new Date()
          });
          if (process.env.NODE_ENV !== 'test') {
            console.log(`[EmailService] Mock email dispatched to: ${mailOptions.to} | Subject: ${mailOptions.subject}`);
          }
          return {
            messageId: `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            accepted: [mailOptions.to],
            response: '250 Mock Email Accepted'
          };
        }
      };
    } else {
      // Clean app password (stripping whitespace if present)
      const cleanPassword = emailPass.replace(/\s+/g, '');
      const isGmail = !process.env.EMAIL_HOST || process.env.EMAIL_HOST.includes('gmail');

      const transportConfig = isGmail
        ? {
            service: 'gmail',
            auth: {
              user: emailUser,
              pass: cleanPassword
            }
          }
        : {
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT, 10) || 587,
            secure: (parseInt(process.env.EMAIL_PORT, 10) || 587) === 465,
            auth: {
              user: emailUser,
              pass: cleanPassword
            },
            tls: {
              rejectUnauthorized: false
            }
          };

      this.transporter = nodemailer.createTransport(transportConfig);

      if (!isTestMode) {
        this.transporter.verify((err) => {
          if (err) {
            this.smtpReady = false;
            this.lastError = err.message;
            console.error('[EmailService] SMTP verification failed:', err.message);
          } else {
            this.smtpReady = true;
            this.lastError = null;
            console.log('[EmailService] SMTP server verified and ready to deliver real emails.');
          }
        });
      }
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

  getClientBaseUrl(origin = null) {
    if (origin && typeof origin === 'string' && (origin.startsWith('https://') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
      return origin.replace(/\/+$/, '');
    }
    if (process.env.FRONTEND_URL) {
      return process.env.FRONTEND_URL.replace(/\/+$/, '');
    }
    const raw = process.env.CLIENT_URL || '';
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const pagesUrl = parts.find(u => u.includes('pages.dev'));
    if (pagesUrl) return pagesUrl.replace(/\/+$/, '');
    const httpsUrl = parts.find(u => u.startsWith('https://'));
    if (httpsUrl) return httpsUrl.replace(/\/+$/, '');
    if (parts.length > 0) return parts[0].replace(/\/+$/, '');
    return 'https://oibsip-webdev-l3--pizza-delivery-full-stack-application.pages.dev';
  }

  async sendViaResend(options) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM || 'Zomato Pizza <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Resend HTTP error ${response.status}`);
    }
    return {
      messageId: data.id,
      accepted: [options.to],
      provider: 'resend'
    };
  }

  async sendMail(options) {
    // 1. If Resend HTTPS API Key is set, dispatch over Port 443 (bypasses all cloud SMTP port blocks)
    if (process.env.RESEND_API_KEY && process.env.NODE_ENV !== 'test') {
      try {
        const result = await this.sendViaResend(options);
        this.lastError = null;
        console.log(`[EmailService/Resend] Email delivered to: ${options.to} | Id: ${result.messageId}`);
        return result;
      } catch (err) {
        console.error('[EmailService/Resend] HTTPS dispatch notice:', err.message);
        this.lastError = err.message;
      }
    }

    const fromAddress = process.env.EMAIL_FROM || `"Pizza Delivery" <${process.env.EMAIL_USER || 'no-reply@pizzadelivery.com'}>`;
    const mailOptions = {
      from: fromAddress,
      ...options
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      this.lastError = null;
      console.log(`[EmailService] Email successfully delivered to: ${options.to} | MessageId: ${result.messageId}`);
      return result;
    } catch (error) {
      console.error('[EmailService] Dispatch error to', options.to, ':', error.message);
      this.lastError = error.message;
      if (process.env.NODE_ENV === 'test') {
        throw error;
      }
      return { error: error.message };
    }
  }

  async sendVerificationEmail(email, name, token, origin = null) {
    const clientUrl = this.getClientBaseUrl(origin);
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

  async sendPasswordResetEmail(email, name, token, origin = null) {
    const clientUrl = this.getClientBaseUrl(origin);
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
