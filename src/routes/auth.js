const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../lib/mailer');
const { normalizeProfilePayload } = require('../lib/profile');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, phone, username, address, number, complement, city, state, zip_code, gender, cnpj, services } = req.body;
  const company = Boolean(cnpj);
  if (!String(name || '').trim()) {
    return res.status(400).json({ error: 'O campo "Nome" é obrigatório' });
  }
  if (!String(email || '').trim()) {
    return res.status(400).json({ error: 'O campo "E-mail" é obrigatório' });
  }
  if (!String(password || '').trim()) {
    return res.status(400).json({ error: 'O campo "Senha" é obrigatória' });
  }
  if (!/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}$/.test(password)) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres, com maiúscula, número e caractere especial' });
  }
  if (!String(phone || '').trim()) {
    return res.status(400).json({ error: 'O campo "Celular" é obrigatório' });
  }
  if (!String(address || '').trim()) {
    return res.status(400).json({ error: 'O campo "Endereço" é obrigatório' });
  }
  if (!String(city || '').trim()) {
    return res.status(400).json({ error: 'O campo "Cidade" é obrigatório' });
  }
  if (!String(state || '').trim()) {
    return res.status(400).json({ error: 'O campo "Estado" é obrigatório' });
  }
  if (!String(zip_code || '').trim()) {
    return res.status(400).json({ error: 'O campo "CEP" é obrigatório' });
  }
  if (!company && !String(gender || '').trim()) {
    return res.status(400).json({ error: 'O campo "Sexo" é obrigatório' });
  }
  if (gender && !['masculino', 'feminino', 'indefinido'].includes(gender)) {
    return res.status(400).json({ error: 'Sexo inválido' });
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

  const newUser = { name, email: emailNorm, password_hash: hashed, phone, address, number, complement, city, state, zip_code, gender };
  if (usernameNorm) newUser.username = usernameNorm;
  if (company) newUser.cnpj = String(cnpj).replace(/\D/g, '');

  const { data, error } = await supabase
    .from('users')
    .insert(newUser)
    .select('id, name, email, phone, address, number, complement, city, state, zip_code, gender, cnpj')
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    return res.status(500).json({ error: 'Erro ao criar usuário' });
  }

  // Se for empresa, criar a barbearia e os serviços cadastrados
  if (company && Array.isArray(services)) {
    let lat = 0, lng = 0;
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${address}, ${city} - ${state}`)}`);
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo && geo.length) { lat = parseFloat(geo[0].lat); lng = parseFloat(geo[0].lon); }
      }
    } catch (e) { /* mantém 0,0 se não geocodificar */ }

    const { data: shop, error: shopErr } = await supabase
      .from('barbershops')
      .insert({ name, address, city, state, phone, latitude: lat, longitude: lng, owner_id: data.id })
      .select('id')
      .single();

    if (shopErr) {
      console.error('Erro ao criar barbearia:', shopErr);
    } else if (services.length > 0) {
      const VALID_CATEGORIES = ['corte', 'corte_feminino', 'barba', 'sobrancelha', 'pigmento', 'combo', 'tratamento'];
      const serviceRows = services
        .map(s => ({
          barbershop_id: shop.id,
          name: String(s.name || '').trim(),
          description: String(s.description || '').trim() || null,
          price: Math.max(0, parseFloat(s.price) || 0),
          duration_minutes: Math.max(1, parseInt(s.duration_minutes, 10) || 30),
          category: VALID_CATEGORIES.includes(s.category) ? s.category : 'corte',
        }))
        .filter(s => s.name && s.price > 0);

      if (serviceRows.length > 0) {
        const { error: svcErr } = await supabase.from('services').insert(serviceRows);
        if (svcErr) console.error('Erro ao criar serviços:', svcErr);
      }
    }
  }

  const token = jwt.sign({ id: data.id, email: data.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ user: { ...data, address: data.address || '', number: data.number || '', complement: data.complement || '', city: data.city || '', state: data.state || '' }, token, isCompany: company });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const identifier = String(email || '').trim();
  const normalized = identifier.toLowerCase();

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalized)
    .single();

  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, ...safeUser } = user;

  // Identificar empresa (CNPJ cadastrado)
  const isCompany = Boolean(user.cnpj) || user.email === 'empresa@lebux.com';

  const { data: barbershops } = isCompany
    ? await supabase.from('barbershops').select('id, name, address, city').eq('owner_id', user.id)
    : { data: [] };

  res.json({
    user: {
      ...safeUser,
      address: safeUser.address || '',
      number: safeUser.number || '',
      complement: safeUser.complement || '',
      city: safeUser.city || '',
      state: safeUser.state || '',
    },
    token,
    isCompany,
    barbershops: barbershops || []
  });
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

// PATCH /api/auth/profile - Atualizar dados do perfil (requer autenticação)
router.patch('/profile', require('../middleware/auth'), async (req, res) => {
  const payload = normalizeProfilePayload(req.body || {});

  if (!Object.keys(payload).length) {
    return res.status(400).json({ error: 'Nenhum dado para atualizar' });
  }

  if (!String(payload.name || '').trim()) {
    return res.status(400).json({ error: 'O campo "Nome" é obrigatório' });
  }
  if (!String(payload.email || '').trim()) {
    return res.status(400).json({ error: 'O campo "E-mail" é obrigatório' });
  }
  if (!String(payload.phone || '').trim()) {
    return res.status(400).json({ error: 'O campo "Celular" é obrigatório' });
  }
  if (payload.gender && !['masculino', 'feminino', 'indefinido'].includes(payload.gender)) {
    return res.status(400).json({ error: 'Sexo inválido' });
  }

  if (payload.email) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', payload.email)
      .single();

    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }
  }

  const updateProfile = async (dataToUpdate) => {
    return supabase
      .from('users')
      .update(dataToUpdate)
      .eq('id', req.user.id)
      .select('id, name, email, phone, address, number, complement, city, state, zip_code, gender, cnpj')
      .single();
  };

  let { data, error } = await updateProfile(payload);

  if (error) {
    const message = error.message || '';
    const missingColumn = /column .* does not exist/i.test(message);
    const invalidInput = /invalid input value/i.test(message);

    if (missingColumn) {
      const fallbackPayload = Object.fromEntries(
        Object.entries(payload).filter(([key]) => !['number', 'complement', 'zip_code', 'gender'].includes(key))
      );
      ({ data, error } = await updateProfile(fallbackPayload));
    }

    if (error) {
      console.error('Erro ao atualizar perfil:', error);
      const friendlyMessage = missingColumn || invalidInput
        ? 'Alguns campos não estão disponíveis na base de dados ainda. Tente novamente mais tarde.'
        : 'Erro ao atualizar perfil';
      return res.status(500).json({ error: friendlyMessage });
    }
  }

  res.json({ user: { ...data, address: data.address || '', number: data.number || '', complement: data.complement || '', city: data.city || '', state: data.state || '' } });
});

// PATCH /api/auth/password - Alterar senha (requer autenticação)
router.patch('/password', require('../middleware/auth'), async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres' });
  }
  if (!/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/.test(new_password)) {
    return res.status(400).json({ error: 'Nova senha deve conter maiúscula, número e caractere especial' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', req.user.id)
    .single();

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

  const hashed = await bcrypt.hash(new_password, 12);
  const { error } = await supabase.from('users').update({ password_hash: hashed }).eq('id', req.user.id);
  if (error) return res.status(500).json({ error: 'Erro ao alterar senha' });

  res.json({ message: 'Senha alterada com sucesso' });
});

module.exports = router;
