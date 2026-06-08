-- ============================================================
-- LEBUX - Schema do banco de dados (Supabase / PostgreSQL)
-- Cole este SQL no SQL Editor do Supabase e execute
-- ============================================================

-- Usuários (clientes)
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tokens de redefinição de senha (para implementar fluxo seguro)
CREATE TABLE password_resets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Barbearias
CREATE TABLE barbershops (
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
CREATE TABLE barbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barbershop_id UUID REFERENCES barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Serviços oferecidos
CREATE TABLE services (
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
CREATE TABLE appointments (
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
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  barbershop_id UUID REFERENCES barbershops(id),
  appointment_id UUID REFERENCES appointments(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_barbershops_location ON barbershops(latitude, longitude);
CREATE INDEX idx_appointments_date ON appointments(barbershop_id, date);
CREATE INDEX idx_appointments_user ON appointments(user_id);

-- ============================================================
-- DADOS DE EXEMPLO (barbearias demo)
-- ============================================================
INSERT INTO barbershops (name, description, address, city, state, phone, latitude, longitude, is_open, rating, total_reviews)
VALUES
  ('Barber King', 'A melhor barbearia da cidade, especialista em cortes modernos e barba.', 'Rua das Flores, 123', 'Jaú', 'SP', '(14) 99999-0001', -22.2964, -48.5589, true, 4.9, 124),
  ('Studio 7', 'Espaço moderno com barbeiros especializados em cortes e sobrancelha.', 'Av. Central, 456', 'Jaú', 'SP', '(14) 99999-0002', -22.2994, -48.5559, true, 4.7, 89),
  ('Noble Barbers', 'Experiência premium em barbearia com tratamentos exclusivos.', 'Rua Prudente de Moraes, 321', 'Jaú', 'SP', '(14) 99999-0004', -22.2934, -48.5619, true, 4.8, 67);

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
    (noble_id, 'Experiência Completa', 120, 90, 'combo');
END $$;

-- ============================================================
-- RLS (Row Level Security) - Segurança por linha
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Barbearias são públicas para leitura
ALTER TABLE barbershops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "barbershops_public_read" ON barbershops FOR SELECT USING (true);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services_public_read" ON services FOR SELECT USING (true);

ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "barbers_public_read" ON barbers FOR SELECT USING (true);
