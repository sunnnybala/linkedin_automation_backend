const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('[EMAIL] SMTP not configured');
    return null;
  }
  transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
}

async function sendCreditsDepletedEmail(to, name) {
  const tx = getTransporter();
  if (!tx) return;
  const from = process.env.MAIL_FROM || 'no-reply@example.com';
  const subject = 'Your credits are used up';
  const html = `<p>Hi ${name},</p><p>Your credit balance is 0. Please add credits to continue posting.</p>`;
  await tx.sendMail({ from, to, subject, html });
}

module.exports = { sendCreditsDepletedEmail };


