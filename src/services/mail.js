const nodemailer = require('nodemailer');

let transporter = null;

function getTransport() {
  if (transporter) return transporter;
  const secure = String(process.env.SMTP_SECURE || '1') === '1';
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || (secure ? 465 : 587)),
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST) {
    console.warn('⚠️ SMTP no configurado. Simulando envío:\n', { to, subject, text });
    return { simulated: true };
  }
  const info = await getTransport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html
  });
  return info;
}

module.exports = { sendMail };
