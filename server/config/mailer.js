const emailService = require('../services/emailService');

module.exports = {
  transporter: emailService.transporter,
  sendMail: (options) => emailService.sendMail(options),
  emailService
};
