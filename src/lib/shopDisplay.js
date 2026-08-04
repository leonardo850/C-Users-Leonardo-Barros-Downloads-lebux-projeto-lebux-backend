function normalizeShopForClient(shop) {
  const services = Array.isArray(shop?.services) ? shop.services : [];
  const hasServices = services.length > 0;

  const baseName = shop?.name || 'Estabelecimento';
  const displayName = hasServices
    ? `${baseName} • Serviços`
    : baseName;

  return {
    ...shop,
    display_name: displayName,
    service_provider: hasServices,
    listing_type: hasServices ? 'estabelecimento-profissional' : 'estabelecimento',
  };
}

module.exports = {
  normalizeShopForClient,
};
