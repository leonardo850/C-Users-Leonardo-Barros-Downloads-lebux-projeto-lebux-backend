require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const barbershopRoutes = require('./routes/barbershops');
const appointmentRoutes = require('./routes/appointments');
const serviceRoutes = require('./routes/services');
const supabase = require('./lib/supabase');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/barbershops', barbershopRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/services', serviceRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', app: 'Lebux API' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3001;

async function ensureAdminUser() {
  const adminEmail = 'lebuxapp@gmail.com';
  const adminUsername = 'admin';
  const adminPassword = 'Enrico@24';

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .or(`email.eq.${adminEmail},username.eq.${adminUsername}`)
    .single();

  if (existing) {
    if (existing.role !== 'admin') {
      await supabase.from('users').update({ role: 'admin' }).eq('id', existing.id);
    }
    return;
  }

  const hashed = await bcrypt.hash(adminPassword, 12);
  await supabase.from('users').insert({
    name: 'Admin Lebux',
    username: adminUsername,
    email: adminEmail,
    password_hash: hashed,
    role: 'admin',
  });
}

ensureAdminUser().catch(err => console.error('Erro ao garantir usuário admin:', err));

app.listen(PORT, () => console.log(`🚀 Lebux API rodando na porta ${PORT}`));
