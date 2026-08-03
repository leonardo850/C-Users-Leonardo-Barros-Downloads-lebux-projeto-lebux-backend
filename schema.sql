-- ============================================================
-- LEBUX - Schema do banco de dados (Supabase / PostgreSQL)
-- Cole este SQL no SQL Editor do Supabase e execute
-- Pode ser executado mais de uma vez (não gera erro)
-- ============================================================

-- Usuários (clientes e empresas)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  cnpj TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Colunas de endereço (se não existirem)
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;

-- Tokens de redefinição de senha (para implementar fluxo seguro)
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Barbearias
CREATE TABLE IF NOT EXISTS barbershops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'SP',
  phone TEXT,
  email TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  is_open BOOLEAN DEFAULT true,
  opening_time TIME DEFAULT '09:00',
  closing_time TIME DEFAULT '19:00',
  rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Barbeiros (funcionários)
CREATE TABLE IF NOT EXISTS barbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barbershop_id UUID REFERENCES barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Serviços oferecidos
CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barbershop_id UUID REFERENCES barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  category TEXT DEFAULT 'corte',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agendamentos
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  barbershop_id UUID REFERENCES barbershops(id),
  service_id UUID REFERENCES services(id),
  barber_id UUID REFERENCES barbers(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  price DECIMAL(10,2),
  notes TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Avaliações
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  barbershop_id UUID REFERENCES barbershops(id),
  appointment_id UUID REFERENCES appointments(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Horários de funcionamento por dia da semana
CREATE TABLE IF NOT EXISTS business_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barbershop_id UUID REFERENCES barbershops(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN DEFAULT true,
  open_time TIME DEFAULT '09:00',
  close_time TIME DEFAULT '19:00',
  UNIQUE(barbershop_id, day_of_week)
);

-- Horários padrão para barbearias existentes (opcional)
INSERT INTO business_hours (barbershop_id, day_of_week, is_open, open_time, close_time)
SELECT id, 0, false, '09:00', '19:00' FROM barbershops WHERE NOT EXISTS (SELECT 1 FROM business_hours WHERE barbershop_id = barbershops.id AND day_of_week = 0);
INSERT INTO business_hours (barbershop_id, day_of_week, is_open, open_time, close_time)
SELECT id, 1, true, '09:00', '19:00' FROM barbershops WHERE NOT EXISTS (SELECT 1 FROM business_hours WHERE barbershop_id = barbershops.id AND day_of_week = 1);
INSERT INTO business_hours (barbershop_id, day_of_week, is_open, open_time, close_time)
SELECT id, 2, true, '09:00', '19:00' FROM barbershops WHERE NOT EXISTS (SELECT 1 FROM business_hours WHERE barbershop_id = barbershops.id AND day_of_week = 2);
INSERT INTO business_hours (barbershop_id, day_of_week, is_open, open_time, close_time)
SELECT id, 3, true, '09:00', '19:00' FROM barbershops WHERE NOT EXISTS (SELECT 1 FROM business_hours WHERE barbershop_id = barbershops.id AND day_of_week = 3);
INSERT INTO business_hours (barbershop_id, day_of_week, is_open, open_time, close_time)
SELECT id, 4, true, '09:00', '19:00' FROM barbershops WHERE NOT EXISTS (SELECT 1 FROM business_hours WHERE barbershop_id = barbershops.id AND day_of_week = 4);
INSERT INTO business_hours (barbershop_id, day_of_week, is_open, open_time, close_time)
SELECT id, 5, true, '09:00', '19:00' FROM barbershops WHERE NOT EXISTS (SELECT 1 FROM business_hours WHERE barbershop_id = barbershops.id AND day_of_week = 5);
INSERT INTO business_hours (barbershop_id, day_of_week, is_open, open_time, close_time)
SELECT id, 6, true, '09:00', '13:00' FROM barbershops WHERE NOT EXISTS (SELECT 1 FROM business_hours WHERE barbershop_id = barbershops.id AND day_of_week = 6);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_barbershops_location ON barbershops(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(barbershop_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_business_hours_shop ON business_hours(barbershop_id);

-- ============================================================
-- DADOS DE EXEMPLO (barbearias demo)
-- ============================================================
INSERT INTO barbershops (name, description, address, city, state, phone, latitude, longitude, is_open, rating, total_reviews)
VALUES
  ('Barber King', 'A melhor barbearia da cidade, especialista em cortes modernos e barba.', 'Rua das Flores, 123', 'Jaú', 'SP', '(14) 99999-0001', -22.2964, -48.5589, true, 4.9, 124),
  ('Studio 7', 'Espaço moderno com barbeiros especializados em cortes e sobrancelha.', 'Av. Central, 456', 'Jaú', 'SP', '(14) 99999-0002', -22.2994, -48.5559, true, 4.7, 89),
  ('Noble Barbers', 'Experiência premium em barbearia com tratamentos exclusivos.', 'Rua Prudente de Moraes, 321', 'Jaú', 'SP', '(14) 99999-0004', -22.2934, -48.5619, true, 4.8, 67)
ON CONFLICT DO NOTHING;

-- Buscar IDs das barbearias inseridas para adicionar serviços
DO $$
DECLARE
  king_id UUID;
  studio_id UUID;
  noble_id UUID;
BEGIN
  SELECT id INTO king_id FROM barbershops WHERE name = 'Barber King';
  SELECT id INTO studio_id FROM barbershops WHERE name = 'Studio 7';
  SELECT id INTO noble_id FROM barbershops WHERE name = 'Noble Barbers';

  INSERT INTO services (barbershop_id, name, price, duration_minutes, category) VALUES
    (king_id, 'Corte Clássico', 30, 30, 'corte'),
    (king_id, 'Barba Completa', 25, 25, 'barba'),
    (king_id, 'Corte + Barba', 50, 50, 'combo'),
    (king_id, 'Pigmentação', 70, 60, 'pigmento'),
    (studio_id, 'Corte Moderno', 25, 25, 'corte'),
    (studio_id, 'Sobrancelha', 15, 15, 'sobrancelha'),
    (studio_id, 'Corte + Sobrancelha', 35, 40, 'combo'),
    (noble_id, 'Corte Premium', 55, 45, 'corte'),
    (noble_id, 'Barba Relaxante', 45, 40, 'barba'),
    (noble_id, 'Experiência Completa', 120, 90, 'combo')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- RLS (Row Level Security) - Segurança por linha
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Barbearias são públicas para leitura
ALTER TABLE barbershops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "barbershops_public_read" ON barbershops;
CREATE POLICY "barbershops_public_read" ON barbershops FOR SELECT USING (true);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "services_public_read" ON services;
CREATE POLICY "services_public_read" ON services FOR SELECT USING (true);

ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "barbers_public_read" ON barbers;
CREATE POLICY "barbers_public_read" ON barbers FOR SELECT USING (true);
