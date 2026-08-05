function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchesShopSearch(shop = {}, searchTerm = '') {
  const normalizedSearch = normalizeText(searchTerm);
  if (!normalizedSearch) return true;

  const haystack = [
    shop.name,
    shop.address,
    shop.city,
    shop.state,
    shop.description,
  ]
    .filter(Boolean)
    .map(normalizeText)
    .join(' ');

  return haystack.includes(normalizedSearch);
}

module.exports = { normalizeText, matchesShopSearch };
