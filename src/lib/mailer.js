const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const fromAddress = process.env.SMTP_FROM || 'Lebux <no-reply@lebux.com>';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

let transporter;
if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
    <p>Olá,</p>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta Lebux.</p>
    <p>Para continuar, clique no link abaixo:</p>
    <p><a href="${resetUrl}">Redefinir minha senha</a></p>
    <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
    <p>Link expira em 15 minutos.</p>
  `;

  if (!transporter) {
    console.warn('SMTP não configurado. Não foi possível enviar e-mail de recuperação para', email);
    console.warn('Link de redefinição:', resetUrl);
    return;
  }

  await transporter.sendMail({
    from: fromAddress,
    to: email,
    subject: 'Redefinição de senha Lebux',
    html,
  });
}

module.exports = { sendPasswordResetEmail };
