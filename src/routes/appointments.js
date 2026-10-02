const express = require('express');
const supabase = require('../lib/supabase');
const authMiddleware = require('../middleware/auth');
const { mapBookingError, validateBookingInput } = require('../lib/booking');

const router = express.Router();

// POST /api/appointments — criar agendamento (requer login)
router.post('/', authMiddleware, async (req, res) => {
  const { barbershop_id, service_id, barber_id, date, start_time, notes } = req.body;

  const validationError = validateBookingInput({ barbershop_id, service_id, barber_id, date, start_time });
  if (validationError) return res.status(400).json({ error: validationError });
  if (notes != null && (typeof notes !== 'string' || notes.length > 1000)) {
    return res.status(400).json({ error: 'Observações devem ter no máximo 1000 caracteres' });
  }

  const { data: appointmentId, error: bookingError } = await supabase.rpc('create_appointment_atomic', {
    p_user_id: req.user.id,
    p_barbershop_id: barbershop_id,
    p_service_id: service_id,
    p_barber_id: barber_id || null,
    p_date: date,
    p_start_time: start_time,
    p_notes: notes || null,
    p_owner_id: null,
  });

  if (bookingError) {
    const mapped = mapBookingError(bookingError);
    return res.status(mapped.status).json({ error: mapped.error });
  }

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      barbershops (name, address),
      services (name, price, duration_minutes)
    `)
    .eq('id', appointmentId)
    .single();

  if (error) return res.status(500).json({ error: 'Agendamento criado, mas não foi possível carregar os detalhes' });

  res.status(201).json({ appointment: data, message: `Agendamento confirmado! ${data.services?.name || 'Serviço'} em ${date} às ${start_time}` });
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
