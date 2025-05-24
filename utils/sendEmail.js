const nodemailer = require('nodemailer');
const config = require('../config/config');

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    service: config.emailService,
    auth: {
      user: config.emailUsername,
      pass: config.emailPassword
    }
  });

const mailOptions = {
    from: `${config.emailFrom} <${config.emailUsername}>`,
    to: options.email,
    subject: options.subject,
    html: options.message,
    attachments: options.attachments || [] 
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;