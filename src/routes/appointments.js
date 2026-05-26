const express = require('express');
const supabase = require('../lib/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/appointments — criar agendamento (requer login)
router.post('/', authMiddleware, async (req, res) => {
  const { barbershop_id, service_id, barber_id, date, start_time, notes } = req.body;

  if (!barbershop_id || !service_id || !date || !start_time) {
    return res.status(400).json({ error: 'Campos obrigatórios: barbershop_id, service_id, date, start_time' });
  }

  // Verificar conflito de horário
  const { data: conflict } = await supabase
    .from('appointments')
    .select('id')
    .eq('barbershop_id', barbershop_id)
    .eq('date', date)
    .eq('start_time', start_time)
    .in('status', ['confirmed', 'pending'])
    .single();

  if (conflict) return res.status(409).json({ error: 'Horário já ocupado. Escolha outro.' });

  const { data: service } = await supabase
    .from('services')
    .select('price, duration_minutes, name')
    .eq('id', service_id)
    .single();

  if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      user_id: req.user.id,
      barbershop_id,
      service_id,
      barber_id: barber_id || null,
      date,
      start_time,
      price: service.price,
      notes: notes || null,
      status: 'confirmed'
    })
    .select(`
      *,
      barbershops (name, address),
      services (name, price, duration_minutes)
    `)
    .single();

  if (error) return res.status(500).json({ error: 'Erro ao criar agendamento' });

  res.status(201).json({ appointment: data, message: `Agendamento confirmado! ${service.name} em ${date} às ${start_time}` });
});

// GET /api/appointments — agendamentos do usuário logado
router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      barbershops (name, address, phone),
      services (name, duration_minutes)
    `)
    .eq('user_id', req.user.id)
    .order('date', { ascending: false });

  if (error) return res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  res.json({ appointments: data });
});

// PATCH /api/appointments/:id/cancel
router.patch('/:id/cancel', authMiddleware, async (req, res) => {
  const { data: appt } = await supabase
    .from('appointments')
    .select('user_id, date, start_time')
    .eq('id', req.params.id)
    .single();

  if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });
  if (appt.user_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: 'Erro ao cancelar' });
  res.json({ message: 'Agendamento cancelado com sucesso' });
});

module.exports = router;
