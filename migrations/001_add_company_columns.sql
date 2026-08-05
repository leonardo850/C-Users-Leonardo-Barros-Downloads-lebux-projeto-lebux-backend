-- ============================================================
-- LEBUX - Migração: colunas faltantes na tabela users
-- Cole este SQL no SQL Editor do Supabase e execute
-- (pode rodar mais de uma vez, é seguro)
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS cnpj TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS complement TEXT;
