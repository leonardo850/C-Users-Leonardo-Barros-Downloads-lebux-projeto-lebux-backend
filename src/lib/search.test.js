const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesShopSearch } = require('./search');

test('matchesShopSearch finds partial matches in shop name', () => {
  const shop = { name: 'Barbearia do Correa', address: 'Rua X', city: 'São José', state: 'SP' };
  assert.equal(matchesShopSearch(shop, 'correa'), true);
  assert.equal(matchesShopSearch(shop, 'barb'), true);
  assert.equal(matchesShopSearch(shop, 'sao jose'), true);
  assert.equal(matchesShopSearch(shop, 'xyz'), false);
});
