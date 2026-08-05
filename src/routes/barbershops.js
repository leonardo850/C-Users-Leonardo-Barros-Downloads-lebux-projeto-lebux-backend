const express = require('express');
const supabase = require('../lib/supabase');
const { normalizeShopForClient } = require('../lib/shopDisplay');
const { matchesShopSearch } = require('../lib/search');

const router = express.Router();

// GET /api/barbershops?lat=-23.29&lng=-48.56&radius=10
router.get('/', async (req, res) => {
  const { lat, lng, radius = 10, search, category } = req.query;

  let query = supabase
    .from('barbershops')
    .select(`
      id, name, address, city, state, phone, description,
      latitude, longitude, is_open, rating, total_reviews,
      services (id, name, price, duration_minutes, category)
    `)
    .eq('active', true);

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,address.ilike.%${search}%,city.ilike.%${search}%,state.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Erro ao buscar barbearias' });

  let result = (data || []).map(normalizeShopForClient);

  if (search) {
    result = result.filter((shop) => matchesShopSearch(shop, search));
  }

  // Calcular distância se lat/lng fornecidos
  if (lat && lng) {
    result = result
      .map(shop => {
        const dist = calcDistance(
          parseFloat(lat), parseFloat(lng),
          shop.latitude, shop.longitude
        );
        return { ...shop, distance_km: parseFloat(dist.toFixed(2)) };
      })
      .filter(s => s.distance_km <= parseFloat(radius))
      .sort((a, b) => a.distance_km - b.distance_km);
  }

  res.json({ barbershops: result, total: result.length });
});

// GET /api/barbershops/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('barbershops')
    .select(`
      *,
      services (*),
      barbers (id, name, bio, avatar_url)
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Barbearia não encontrada' });
  res.json(normalizeShopForClient(data));
});

// GET /api/barbershops/:id/availability?date=2025-01-15&service_id=1
router.get('/:id/availability', async (req, res) => {
  const { date, service_id } = req.query;
  if (!date) return res.status(400).json({ error: 'Data obrigatória' });

  const { data: booked } = await supabase
    .from('appointments')
    .select('start_time')
    .eq('barbershop_id', req.params.id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending']);

  const bookedTimes = (booked || []).map(a => a.start_time);

  const slots = [];
  for (let h = 9; h < 18; h++) {
    for (let m = 0; m < 60; m += 30) {
      const time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      slots.push({ time, available: !bookedTimes.includes(time) });
    }
  }

  res.json({ date, slots });
});

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(v) { return v * Math.PI / 180; }

module.exports = router;
