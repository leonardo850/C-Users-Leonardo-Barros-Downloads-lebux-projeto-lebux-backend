const express = require('express');
const supabase = require('../lib/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Middleware para verificar role = company
function companyMiddleware(req, res, next) {
  if (req.user.role !== 'company') {
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

  if (search) {
    query = query.or(`users.name.ilike.%${search}%,users.email.ilike.%${search}%`);
  }

  const { data: appointments, error } = await query;
  if (error) return res.status(500).json({ error: 'Erro ao buscar clientes' });

  const clientMap = {};
  for (const apt of appointments) {
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

  if (!user_id || !barbershop_id || !service_id || !date || !start_time) {
    return res.status(400).json({ error: 'Campos obrigatórios: user_id, barbershop_id, service_id, date, start_time' });
  }

  // Verificar se a barbearia pertence à empresa
  const { data: shop } = await supabase
    .from('barbershops')
    .select('id')
    .eq('id', barbershop_id)
    .eq('owner_id', req.user.id)
    .single();

  if (!shop) return res.status(403).json({ error: 'Barbearia não pertence à sua empresa' });

  // Verificar conflito de horário
  const { data: conflict } = await supabase
    .from('appointments')
    .select('id')
    .eq('barbershop_id', barbershop_id)
    .eq('date', date)
    .eq('start_time', start_time)
    .in('status', ['confirmed', 'pending'])
    .single();

  if (conflict) return res.status(409).json({ error: 'Horário já ocupado' });

  const { data: service } = await supabase
    .from('services')
    .select('price, name')
    .eq('id', service_id)
    .single();

  if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      user_id,
      barbershop_id,
      service_id,
      barber_id: barber_id || null,
      date,
      start_time,
      price: service.price,
      notes: notes || null,
      status: 'confirmed',
    })
    .select(`
      *,
      users (id, name, email, phone),
      barbershops (name, address),
      services (name, price, duration_minutes)
    `)
    .single();

  if (error) return res.status(500).json({ error: 'Erro ao criar agendamento' });
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

module.exports = router;
