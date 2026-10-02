const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const fromAddress = process.env.SMTP_FROM || 'Lebux <no-reply@lebux.com>';
const frontendUrl = process.env.FRONTEND_URL;

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
  if (!transporter) throw new Error('SMTP não está configurado');
  if (!frontendUrl) throw new Error('FRONTEND_URL não está configurada');

  let parsedFrontendUrl;
  try {
    parsedFrontendUrl = new URL(frontendUrl);
  } catch {
    throw new Error('FRONTEND_URL inválida');
  }
  if (!['http:', 'https:'].includes(parsedFrontendUrl.protocol)) {
    throw new Error('FRONTEND_URL deve usar HTTP ou HTTPS');
  }

  const resetUrl = new URL('/reset-password', parsedFrontendUrl);
  resetUrl.searchParams.set('token', token);
  const html = `
    <p>Olá,</p>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta Lebux.</p>
    <p>Para continuar, clique no link abaixo:</p>
    <p><a href="${resetUrl.toString()}">Redefinir minha senha</a></p>
    <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
    <p>Link expira em 15 minutos.</p>
  `;

  await transporter.sendMail({
    from: fromAddress,
    to: email,
    subject: 'Redefinição de senha Lebux',
    html,
  });
}

module.exports = { sendPasswordResetEmail };
