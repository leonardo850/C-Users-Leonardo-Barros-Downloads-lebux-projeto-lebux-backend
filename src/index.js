require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const barbershopRoutes = require('./routes/barbershops');
const appointmentRoutes = require('./routes/appointments');
const serviceRoutes = require('./routes/services');
const companyRoutes = require('./routes/company');
const { validateEnvironment, ensureSeedUsers } = require('./lib/bootstrap');

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

try {
  validateEnvironment();
} catch (error) {
  console.error(error.message);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

ensureSeedUsers()
  .catch(err => console.error('Erro ao garantir usuários seed:', err));

app.listen(PORT, () => console.log(`🚀 Lebux API rodando na porta ${PORT}`));
