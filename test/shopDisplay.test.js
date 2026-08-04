const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeShopForClient } = require('../src/lib/shopDisplay');

test('normalizeShopForClient marks shops with services as service providers', () => {
  const shop = normalizeShopForClient({
    id: '1',
    name: 'Empresa Demo',
    owner_id: 'owner-1',
    services: [{ id: 's1', name: 'Corte' }],
  });

  assert.equal(shop.service_provider, true);
  assert.equal(shop.listing_type, 'estabelecimento-profissional');
});

test('normalizeShopForClient keeps non-service shops as basic establishments', () => {
  const shop = normalizeShopForClient({
    id: '2',
    name: 'Estabelecimento Demo',
    services: [],
  });

  assert.equal(shop.service_provider, false);
  assert.equal(shop.listing_type, 'estabelecimento');
});
