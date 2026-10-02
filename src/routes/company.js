const express = require('express');
const supabase = require('../lib/supabase');
const authMiddleware = require('../middleware/auth');
const { isValidCnpj, isValidUuid } = require('../lib/validation');
const { mapBookingError, validateBookingInput } = require('../lib/booking');

const router = express.Router();

// Middleware para verificar se é empresa
async function companyMiddleware(req, res, next) {
  const { data: user, error } = await supabase
    .from('users')
    .select('cnpj')
    .eq('id', req.user.id)
    .single();

  const isCompany = !error && user && isValidCnpj(user.cnpj);
  if (!isCompany) {
    return res.status(403).json({ error: 'Acesso permitido apenas para empresas' });
  }
  next();
}

// GET /api/company/barbershops — barbearias da empresa logada
router.get('/barbershops', authMiddleware, companyMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('barbershops')
    .select('id, name, address, city, phone, is_open, rating')
    .eq('owner_id', req.user.id);

  if (error) return res.status(500).json({ error: 'Erro ao buscar barbearias' });
  res.json({ barbershops: data });
});

// GET /api/company/clients?search= — clientes com histórico nas barbearias da empresa
router.get('/clients', authMiddleware, companyMiddleware, async (req, res) => {
  const { search } = req.query;

  const { data: shops } = await supabase
    .from('barbershops')
    .select('id')
    .eq('owner_id', req.user.id);

  if (!shops?.length) return res.json({ clients: [] });
  const shopIds = shops.map(s => s.id);

  let query = supabase
    .from('appointments')
    .select(`
      user_id,
      users!inner (id, name, email, phone),
      barbershops!inner (name)
    `)
    .in('barbershop_id', shopIds);

  const { data: appointments, error } = await query.limit(5000);
  if (error) return res.status(500).json({ error: 'Erro ao buscar clientes' });

  const searchTerm = String(search || '').trim().slice(0, 100).toLocaleLowerCase('pt-BR');
  const clientMap = {};
  for (const apt of appointments) {
    if (searchTerm && !`${apt.users?.name || ''} ${apt.users?.email || ''}`.toLocaleLowerCase('pt-BR').includes(searchTerm)) continue;
    const uid = apt.user_id;
    if (!clientMap[uid]) {
      clientMap[uid] = {
        id: uid,
        name: apt.users?.name || 'Desconhecido',
        email: apt.users?.email || '',
        phone: apt.users?.phone || '',
        total_appointments: 0,
        barbershops: new Set(),
      };
    }
    clientMap[uid].total_appointments++;
    if (apt.barbershops?.name) clientMap[uid].barbershops.add(apt.barbershops.name);
  }

  const clients = Object.values(clientMap).map(c => ({
    ...c,
    barbershops: Array.from(c.barbershops),
  }));

  res.json({ clients });
});

// GET /api/company/appointments — todos agendamentos das barbearias da empresa
router.get('/appointments', authMiddleware, companyMiddleware, async (req, res) => {
  const { data: shops } = await supabase
    .from('barbershops')
    .select('id')
    .eq('owner_id', req.user.id);

  if (!shops?.length) return res.json({ appointments: [] });
  const shopIds = shops.map(s => s.id);

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      users (id, name, email, phone),
      barbershops (name, address),
      services (name, price, duration_minutes)
    `)
    .in('barbershop_id', shopIds)
    .order('date', { ascending: false });

  if (error) return res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  res.json({ appointments: data });
});

// POST /api/company/appointments — empresa agenda para um cliente
router.post('/appointments', authMiddleware, companyMiddleware, async (req, res) => {
  const { user_id, barbershop_id, service_id, barber_id, date, start_time, notes } = req.body;

  const validationError = validateBookingInput({ barbershop_id, service_id, barber_id, date, start_time });
  if (validationError) return res.status(400).json({ error: validationError });
  if (!isValidUuid(user_id)) return res.status(400).json({ error: 'Cliente inválido' });
  if (notes != null && (typeof notes !== 'string' || notes.length > 1000)) {
    return res.status(400).json({ error: 'Observações devem ter no máximo 1000 caracteres' });
  }

  const { data: appointmentId, error: bookingError } = await supabase.rpc('create_appointment_atomic', {
    p_user_id: user_id,
    p_barbershop_id: barbershop_id,
    p_service_id: service_id,
    p_barber_id: barber_id || null,
    p_date: date,
    p_start_time: start_time,
    p_notes: notes || null,
    p_owner_id: req.user.id,
  });

  if (bookingError) {
    const mapped = mapBookingError(bookingError);
    return res.status(mapped.status).json({ error: mapped.error });
  }

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      users (id, name, email, phone),
      barbershops (name, address),
      services (name, price, duration_minutes)
    `)
    .eq('id', appointmentId)
    .single();

  if (error) return res.status(500).json({ error: 'Agendamento criado, mas não foi possível carregar os detalhes' });
  res.status(201).json({ appointment: data, message: `Agendamento criado para ${data.users?.name || 'cliente'}!` });
});

// GET /api/company/reports — resumo/dashboard
router.get('/reports', authMiddleware, companyMiddleware, async (req, res) => {
  const { data: shops } = await supabase
    .from('barbershops')
    .select('id')
    .eq('owner_id', req.user.id);

  if (!shops?.length) {
    return res.json({ total_barbershops: 0, total_clients: 0, total_appointments: 0, total_revenue: 0, appointments_today: 0 });
  }

  const shopIds = shops.map(s => s.id);

  const today = new Date().toISOString().split('T')[0];

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('price, date, status')
    .in('barbershop_id', shopIds);

  if (error) return res.status(500).json({ error: 'Erro ao gerar relatório' });

  const total_appointments = appointments?.length || 0;
  const total_revenue = (appointments || [])
    .filter(a => a.status !== 'cancelled')
    .reduce((sum, a) => sum + parseFloat(a.price || 0), 0);
  const appointments_today = (appointments || []).filter(a => a.date === today).length;

  const uniqueClients = new Set();
  const { data: apts } = await supabase
    .from('appointments')
    .select('user_id')
    .in('barbershop_id', shopIds);
  (apts || []).forEach(a => uniqueClients.add(a.user_id));

  res.json({
    total_barbershops: shops.length,
    total_clients: uniqueClients.size,
    total_appointments,
    total_revenue: total_revenue.toFixed(2),
    appointments_today,
  });
});

// GET /api/company/hours/:shop_id — horários de funcionamento
router.get('/hours/:shop_id', authMiddleware, companyMiddleware, async (req, res) => {
  const { data: shop, error: shopError } = await supabase
    .from('barbershops')
    .select('id')
    .eq('id', req.params.shop_id)
    .eq('owner_id', req.user.id)
    .single();

  if (shopError || !shop) return res.status(403).json({ error: 'Barbearia não pertence à sua empresa' });

  const { data: hours, error } = await supabase
    .from('business_hours')
    .select('*')
    .eq('barbershop_id', req.params.shop_id)
    .order('day_of_week');

  if (error) return res.status(500).json({ error: 'Erro ao buscar horários da barbearia' });

  if (!hours?.length) return res.json({ hours: defaultHours() });
  res.json({ hours });
});

// PUT /api/company/hours/:shop_id — atualizar horários
router.put('/hours/:shop_id', authMiddleware, companyMiddleware, async (req, res) => {
  const { hours } = req.body;
  if (!Array.isArray(hours) || hours.length !== 7) {
    return res.status(400).json({ error: 'Informe exatamente os horários dos sete dias da semana' });
  }

  const days = new Set();
  for (const hour of hours) {
    const day = Number(hour?.day_of_week);
    const openTime = hour?.open_time || '09:00';
    const closeTime = hour?.close_time || '19:00';
    if (!Number.isInteger(day) || day < 0 || day > 6 || days.has(day)) {
      return res.status(400).json({ error: 'Cada dia da semana deve aparecer uma única vez' });
    }
    days.add(day);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closeTime)) {
      return res.status(400).json({ error: 'Horário de abertura ou fechamento inválido' });
    }
    if (hour.is_open !== false && openTime >= closeTime) {
      return res.status(400).json({ error: 'O fechamento deve ocorrer depois da abertura' });
    }
  }

  // Verificar se a barbearia pertence à empresa
  const { data: shop } = await supabase
    .from('barbershops')
    .select('id')
    .eq('id', req.params.shop_id)
    .eq('owner_id', req.user.id)
    .single();

  if (!shop) return res.status(403).json({ error: 'Barbearia não pertence à sua empresa' });

  const records = hours.map(h => ({
    barbershop_id: req.params.shop_id,
    day_of_week: h.day_of_week,
    is_open: h.is_open !== false,
    open_time: h.open_time || '09:00',
    close_time: h.close_time || '19:00',
  }));

  const { data: savedHours, error } = await supabase.rpc('replace_business_hours', {
    p_shop_id: req.params.shop_id,
    p_owner_id: req.user.id,
    p_hours: records.map(({ day_of_week, is_open, open_time, close_time }) => ({ day_of_week, is_open, open_time, close_time })),
  });
  if (error) return res.status(500).json({ error: 'Erro ao salvar horários' });

  res.json({ hours: savedHours || records, message: 'Horários atualizados!' });
});

function defaultHours() {
  return [
    { day_of_week: 0, is_open: false, open_time: '09:00', close_time: '19:00' },
    { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '19:00' },
    { day_of_week: 2, is_open: true, open_time: '09:00', close_time: '19:00' },
    { day_of_week: 3, is_open: true, open_time: '09:00', close_time: '19:00' },
    { day_of_week: 4, is_open: true, open_time: '09:00', close_time: '19:00' },
    { day_of_week: 5, is_open: true, open_time: '09:00', close_time: '19:00' },
    { day_of_week: 6, is_open: true, open_time: '09:00', close_time: '13:00' },
  ];
}

module.exports = router;
