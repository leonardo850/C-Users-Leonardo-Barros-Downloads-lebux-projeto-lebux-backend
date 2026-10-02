const express = require('express');
const supabase = require('../lib/supabase');
const { normalizeShopForClient } = require('../lib/shopDisplay');
const { matchesShopSearch } = require('../lib/search');
const { isValidUuid } = require('../lib/validation');

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

  const { data, error } = await query.limit(1000);
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
  if (!isValidUuid(req.params.id) || !isValidUuid(service_id)) {
    return res.status(400).json({ error: 'Barbearia ou serviço inválidos' });
  }
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ error: 'Data inválida' });
  }

  const [{ data: shop, error: shopError }, { data: service, error: serviceError }] = await Promise.all([
    supabase.from('barbershops').select('id, active, is_open, opening_time, closing_time').eq('id', req.params.id).single(),
    supabase.from('services').select('id, duration_minutes, active').eq('id', service_id).eq('barbershop_id', req.params.id).single(),
  ]);
  if (shopError || !shop || shop.active !== true) return res.status(404).json({ error: 'Barbearia não encontrada' });
  if (serviceError || !service || service.active !== true) return res.status(404).json({ error: 'Serviço não encontrado para esta barbearia' });

  const dayOfWeek = parsedDate.getUTCDay();
  const { data: hours, error: hoursError } = await supabase
    .from('business_hours')
    .select('is_open, open_time, close_time')
    .eq('barbershop_id', req.params.id)
    .eq('day_of_week', dayOfWeek)
    .maybeSingle();
  if (hoursError) return res.status(500).json({ error: 'Erro ao buscar horários de funcionamento' });

  const openTime = hours ? hours.open_time : shop.opening_time || '09:00';
  const closeTime = hours ? hours.close_time : dayOfWeek === 6 ? '13:00' : shop.closing_time || '19:00';
  const shopOpen = shop.is_open !== false && (hours ? hours.is_open === true : dayOfWeek !== 0);
  if (!shopOpen || date < new Date().toISOString().slice(0, 10)) {
    return res.json({ date, slots: [] });
  }

  const { data: booked, error: bookedError } = await supabase
    .from('appointments')
    .select('start_time, services (duration_minutes)')
    .eq('barbershop_id', req.params.id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending']);
  if (bookedError) return res.status(500).json({ error: 'Erro ao buscar agendamentos existentes' });

  const minutes = (value) => {
    const [hour, minute] = String(value || '').slice(0, 5).split(':').map(Number);
    return hour * 60 + minute;
  };
  const openingMinute = minutes(openTime);
  const closingMinute = minutes(closeTime);
  const serviceDuration = Math.max(1, Number(service.duration_minutes) || 30);
  const bookedIntervals = (booked || []).map((appointment) => ({
    start: minutes(appointment.start_time),
    end: minutes(appointment.start_time) + Math.max(1, Number(appointment.services?.duration_minutes) || 30),
  }));

  const slots = [];
  for (let start = openingMinute; start + serviceDuration <= closingMinute; start += 30) {
    const hour = Math.floor(start / 60);
    const minute = start % 60;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const end = start + serviceDuration;
    const available = !bookedIntervals.some((appointment) => start < appointment.end && appointment.start < end);
    slots.push({ time, available });
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
