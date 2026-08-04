function normalizeProfilePayload(payload = {}) {
  const allowedFields = ['name', 'phone', 'address', 'city', 'state', 'zip_code', 'gender', 'email'];
  const result = {};

  allowedFields.forEach((field) => {
    if (typeof payload[field] === 'undefined') return;

    if (field === 'email') {
      result.email = String(payload.email).trim().toLowerCase();
      return;
    }

    if (field === 'name') {
      result.name = String(payload.name).trim();
      return;
    }

    if (field === 'phone') {
      result.phone = String(payload.phone).trim();
      return;
    }

    if (field === 'address' || field === 'city' || field === 'state' || field === 'zip_code') {
      result[field] = String(payload[field]).trim();
      return;
    }

    if (field === 'gender') {
      result.gender = String(payload.gender).trim();
    }
  });

  return result;
}

module.exports = {
  normalizeProfilePayload,
};
