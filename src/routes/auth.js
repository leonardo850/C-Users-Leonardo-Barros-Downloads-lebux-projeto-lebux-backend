const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../lib/mailer');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, phone, username } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const usernameNorm = username ? String(username).trim().toLowerCase() : null;

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .or(`email.eq.${emailNorm}${usernameNorm ? `,username.eq.${usernameNorm}` : ''}`)
    .single();

  if (existing) return res.status(409).json({ error: 'Email ou nome de usuário já cadastrado' });

  const hashed = await bcrypt.hash(password, 12);

  const newUser = { name, email: emailNorm, password_hash: hashed, phone, role: 'user' };
  if (usernameNorm) newUser.username = usernameNorm;

  const { data, error } = await supabase
    .from('users')
    .insert(newUser)
    .select('id, name, email, phone, username, role')
    .single();

  if (error) return res.status(500).json({ error: 'Erro ao criar usuário' });

  const token = jwt.sign({ id: data.id, email: data.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ user: data, token });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const identifier = String(email || '').trim();
  const normalized = identifier.includes('@') ? identifier.toLowerCase() : identifier.toLowerCase();

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .or(`email.eq.${normalized},username.eq.${normalized}`)
    .single();

  if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Email ou senha inválidos' });

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser, token });
});

// POST /api/auth/forgot
router.post('/forgot', async (req, res) => {
  const { email } = req.body;
  const emailNorm = String(email || '').trim().toLowerCase();

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', emailNorm)
    .single();

  // Always respond with a generic message for security reasons
  const genericMsg = { message: 'Se o e-mail existir, você receberá instruções para redefinir a senha.' };

  if (!user) return res.json(genericMsg);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await supabase.from('password_resets').insert({ user_id: user.id, token, expires_at: expiresAt });
  await sendPasswordResetEmail(emailNorm, token);

  return res.json(genericMsg);
});

// POST /api/auth/reset
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token e nova senha são necessários' });

  const { data: pr } = await supabase
    .from('password_resets')
    .select('id, user_id, expires_at')
    .eq('token', token)
    .single();

  if (!pr) return res.status(400).json({ error: 'Token inválido ou expirado' });
  if (new Date(pr.expires_at) < new Date()) return res.status(400).json({ error: 'Token expirado' });

  const hashed = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.from('users').update({ password_hash: hashed }).eq('id', pr.user_id);
  if (error) return res.status(500).json({ error: 'Erro ao redefinir senha' });

  // Invalidate all existing reset tokens for the user
  await supabase.from('password_resets').delete().eq('user_id', pr.user_id);

  return res.json({ message: 'Senha alterada com sucesso' });
});

module.exports = router;
