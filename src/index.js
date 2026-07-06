require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const barbershopRoutes = require('./routes/barbershops');
const appointmentRoutes = require('./routes/appointments');
const serviceRoutes = require('./routes/services');
const companyRoutes = require('./routes/company');
const supabase = require('./lib/supabase');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://lebux.vercel.app',
      'https://frontend-lebux.vercel.app',
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/
    ];
    if (!origin || allowedOrigins.some(a => a instanceof RegExp ? a.test(origin) : a === origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
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
app.use('/api/company', companyRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', app: 'Lebux API' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3001;

async function ensureAdminUser() {
  const adminEmail = 'lebuxapp@gmail.com';
  const adminPassword = 'Enrico@24';

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('email', adminEmail)
    .single();

  if (existing) return;

  const hashed = await bcrypt.hash(adminPassword, 12);
  await supabase.from('users').insert({
    name: 'Admin Lebux',
    email: adminEmail,
    password_hash: hashed,
  });
}

async function ensureCompanyUser() {
  const companyEmail = 'empresa@lebux.com';
  const companyPassword = 'Empresa@123';

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('email', companyEmail)
    .single();

  if (existing) return existing;

  const hashed = await bcrypt.hash(companyPassword, 12);
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      name: 'Barbearia do Leonardo',
      email: companyEmail,
      password_hash: hashed,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao criar usuário empresa:', error);
    return null;
  }

  const { data: firstShop } = await supabase
    .from('barbershops')
    .select('id')
    .limit(1)
    .single();

  if (firstShop) {
    await supabase
      .from('barbershops')
      .update({ owner_id: newUser.id })
      .eq('id', firstShop.id);
    console.log(`✅ Barbearia "${firstShop.id}" vinculada à empresa`);
  }

  return newUser;
}

ensureAdminUser().catch(err => console.error('Erro ao garantir usuário admin:', err));
ensureCompanyUser().catch(err => console.error('Erro ao garantir usuário empresa:', err));

app.listen(PORT, () => console.log(`🚀 Lebux API rodando na porta ${PORT}`));
