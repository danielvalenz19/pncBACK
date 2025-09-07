const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return info.messageId;
  } catch (err) {
    // No rompemos el flujo si el email falla; solo lo registramos.
    console.warn('⚠️  Error enviando correo:', err.message);
    return null;
  }
}

module.exports = { sendMail };
