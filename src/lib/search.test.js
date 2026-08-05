const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesShopSearch } = require('./search');

test('matchesShopSearch finds partial matches in shop name', () => {
  const shop = { name: 'Barbearia do Correa' };
  assert.equal(matchesShopSearch(shop, 'correa'), true);
  assert.equal(matchesShopSearch(shop, 'barb'), true);
  assert.equal(matchesShopSearch(shop, 'barbearia'), true);
  assert.equal(matchesShopSearch(shop, 'xyz'), false);
});
