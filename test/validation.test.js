const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidCnpj, isValidEmail, isValidPassword, isValidUuid } = require('../src/lib/validation');
const { mapBookingError, validateBookingInput } = require('../src/lib/booking');

test('validates CNPJ checksum and rejects repeated digits', () => {
  assert.equal(isValidCnpj('04.252.011/0001-10'), true);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
  assert.equal(isValidCnpj('123'), false);
});

test('validates email, password length/policy, and UUID identifiers', () => {
  assert.equal(isValidEmail('Cliente@example.com'), true);
  assert.equal(isValidEmail('bad-address'), false);
  assert.equal(isValidPassword('StrongPass1!'), true);
  assert.equal(isValidPassword('short'), false);
  assert.equal(isValidPassword(`A1!${'x'.repeat(126)}`), false);
  assert.equal(isValidUuid('a3af8f5c-a814-489c-901e-3ffe0be41341'), true);
  assert.equal(isValidUuid('demo-id'), false);
});

test('validates booking identifiers, calendar date, and time', () => {
  const valid = {
    barbershop_id: '540f2e79-8500-42d0-b078-3a590964a2a2',
    service_id: 'a3af8f5c-a814-489c-901e-3ffe0be41341',
    date: '2026-10-02',
    start_time: '09:30',
  };
  assert.equal(validateBookingInput(valid), null);
  assert.equal(validateBookingInput({ ...valid, date: '2026-02-30' }), 'Data inválida');
  assert.equal(validateBookingInput({ ...valid, start_time: '25:00' }), 'Horário inválido');
});

test('maps database booking conflicts to HTTP conflict responses', () => {
  assert.deepEqual(mapBookingError({ message: 'SLOT_UNAVAILABLE' }), {
    status: 409,
    error: 'Horário indisponível. Escolha outro.',
  });
});
