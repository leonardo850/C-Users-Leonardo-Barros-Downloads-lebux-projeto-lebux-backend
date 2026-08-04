function normalizeProfilePayload(payload = {}) {
  const allowedFields = ['name', 'phone', 'address', 'number', 'complement', 'city', 'state', 'zip_code', 'gender', 'email'];
  const result = {};

  allowedFields.forEach((field) => {
    if (typeof payload[field] === 'undefined') return;

    const value = String(payload[field] ?? '').trim();
    if (!value) return;

    if (field === 'email') {
      result.email = value.toLowerCase();
      return;
    }

    if (field === 'name') {
      result.name = value;
      return;
    }

    if (field === 'phone') {
      result.phone = value;
      return;
    }

    if (field === 'address' || field === 'number' || field === 'complement' || field === 'city' || field === 'state' || field === 'zip_code') {
      result[field] = value;
      return;
    }

    if (field === 'gender') {
      result.gender = value;
    }
  });

  return result;
}

module.exports = {
  normalizeProfilePayload,
};
