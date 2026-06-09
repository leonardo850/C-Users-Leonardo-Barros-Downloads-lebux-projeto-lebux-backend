-- ============================================================
-- LEBUX - Popula barbearias de São José dos Campos
-- Execute no SQL Editor do Supabase
-- ============================================================

INSERT INTO barbershops (name, description, address, city, state, phone, latitude, longitude, is_open, rating, total_reviews)
VALUES
  ('Barbearia do Correa', 'Tradicional barbearia da cidade, referência em cortes clássicos e barba.', 'Rua Sebastião Humel, 123', 'São José dos Campos', 'SP', '(12) 3921-1001', -23.1885, -45.8835, true, 4.8, 156),
  ('Old King Barbershop', 'Barbearia moderna especializada em cortes degradê e barba estilizada.', 'Av. São João, 789', 'São José dos Campos', 'SP', '(12) 3922-2002', -23.1960, -45.8770, true, 4.9, 203),
  ('Barbearia São Benedito', 'Referência no centro há mais de 20 anos, cortes tradicionais e barba.', 'Rua XV de Novembro, 456', 'São José dos Campos', 'SP', '(12) 3923-3003', -23.1895, -45.8840, true, 4.7, 189),
  ('La Uomo Barbearia', 'Barbearia premium com tratamentos capilares e experiência completa.', 'Av. Dr. João Guilhermino, 1000', 'São José dos Campos', 'SP', '(12) 3924-4004', -23.1910, -45.8855, true, 4.6, 134),
  ('Corte & Arte Barbearia', 'Especializada em cortes personalizados e design de barba.', 'Rua Rui Doria, 200', 'São José dos Campos', 'SP', '(12) 3925-5005', -23.2100, -45.9000, true, 4.8, 98),
  ('Barber''s Club', 'Clube de barbearia com ambiente descontraído e barbeiros experts.', 'Av. Lino José de Oliveira, 350', 'São José dos Campos', 'SP', '(12) 3926-6006', -23.1750, -45.8750, true, 4.7, 112),
  ('Vintage Barbershop', 'Estilo retrô com cortes clássicos e barba artesanal.', 'Rua Madre Paula de São José, 80', 'São José dos Campos', 'SP', '(12) 3927-7007', -23.1900, -45.8830, true, 4.5, 76),
  ('Barbearia do Miranda', 'Barbearia familiar com preços acessíveis e atendimento de qualidade.', 'Rua José Bonifácio, 300', 'São José dos Campos', 'SP', '(12) 3928-8008', -23.1880, -45.8845, true, 4.4, 145),
  ('Urban Barbershop', 'Barbearia jovem e moderna, cortes atuais e sobrancelha.', 'Av. São João, 1500', 'São José dos Campos', 'SP', '(12) 3929-9009', -23.1975, -45.8760, true, 4.7, 88),
  ('Barbearia Universitária', 'Próxima às faculdades, cortes rápidos com preço justo.', 'Rua Euclides Miragaia, 500', 'São José dos Campos', 'SP', '(12) 3930-0010', -23.1920, -45.8860, true, 4.3, 201);

-- Inserir serviços para cada barbearia
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, name FROM barbershops WHERE city = 'São José dos Campos' LOOP
    INSERT INTO services (barbershop_id, name, price, duration_minutes, category) VALUES
      (r.id, 'Corte Clássico', 30, 30, 'corte'),
      (r.id, 'Corte Degradê', 35, 35, 'corte'),
      (r.id, 'Barba Completa', 25, 25, 'barba'),
      (r.id, 'Corte + Barba', 50, 50, 'combo'),
      (r.id, 'Sobrancelha', 15, 15, 'sobrancelha'),
      (r.id, 'Hidratação Capilar', 40, 30, 'tratamento'),
      (r.id, 'Pigmentação', 80, 60, 'pigmento'),
      (r.id, 'Barba Desenhada', 20, 20, 'barba');
  END LOOP;
END $$;
