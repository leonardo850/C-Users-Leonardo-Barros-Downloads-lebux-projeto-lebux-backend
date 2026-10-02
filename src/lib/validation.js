const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}$/;

function normalizeCnpj(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (!/^\d{14}$/.test(cnpj) || /^([0-9])\1{13}$/.test(cnpj)) return false;

  const digit = (base, weights) => {
    const remainder = [...base].reduce((sum, char, index) => sum + Number(char) * weights[index], 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(`${cnpj.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

function isValidEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && EMAIL_RE.test(email);
}

function isValidPassword(value) {
  return typeof value === 'string' && PASSWORD_RE.test(value);
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

module.exports = { isValidCnpj, isValidEmail, isValidPassword, isValidUuid, normalizeCnpj };
