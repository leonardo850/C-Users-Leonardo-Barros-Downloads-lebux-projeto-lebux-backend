const express = require('express');
const supabase = require('../lib/supabase');

const router = express.Router();

// GET /api/services?barbershop_id=1
router.get('/', async (req, res) => {
  const { barbershop_id, category } = req.query;

  let query = supabase.from('services').select('*').eq('active', true);
  if (barbershop_id) query = query.eq('barbershop_id', barbershop_id);
  if (category) query = query.eq('category', category);

  const { data, error } = await query.order('price');
  if (error) return res.status(500).json({ error: 'Erro ao buscar serviços' });
  res.json({ services: data });
});

module.exports = router;
