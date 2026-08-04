const test = require('node:test');
const assert = require('node:assert/strict');

const { validateEnvironment, getDemoSeedConfig } = require('../src/lib/bootstrap');

test('validateEnvironment requires the base secrets', () => {
  const env = {
    NODE_ENV: 'test',
  };

  assert.throws(
    () => validateEnvironment({ env }),
    /SUPABASE_URL/
  );
});

test('getDemoSeedConfig returns the demo seed settings when enabled', () => {
  const result = getDemoSeedConfig({
    env: {
      ENABLE_DEMO_SEED: 'true',
      DEMO_ADMIN_EMAIL: 'admin@example.com',
      DEMO_ADMIN_PASSWORD: 'StrongPass1!',
      DEMO_COMPANY_EMAIL: 'company@example.com',
      DEMO_COMPANY_PASSWORD: 'StrongPass1!',
    },
  });

  assert.equal(result.enabled, true);
  assert.equal(result.admin.email, 'admin@example.com');
  assert.equal(result.company.email, 'company@example.com');
});
