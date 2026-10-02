const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../lib/mailer');
const { normalizeProfilePayload } = require('../lib/profile');
const { isValidCnpj, isValidEmail, isValidPassword, normalizeCnpj } = require('../lib/validation');

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
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres, com maiúscula, número e caractere especial' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'E-mail inválido' });
  if (company && !isValidCnpj(cnpj)) return res.status(400).json({ error: 'CNPJ inválido' });
  if (company && !Array.isArray(services)) return res.status(400).json({ error: 'Serviços da empresa inválidos' });
  if ([name, email, phone, address, city, state, zip_code].some(value => String(value || '').length > 254)) {
    return res.status(400).json({ error: 'Um ou mais campos excedem o tamanho permitido' });
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

  const { data: existingEmail, error: emailLookupError } = await supabase
    .from('users')
    .select('id')
    .eq('email', emailNorm)
    .single();

  if (emailLookupError && emailLookupError.code !== 'PGRST116') {
    return res.status(500).json({ error: 'Erro ao validar cadastro' });
  }
  if (existingEmail) return res.status(409).json({ error: 'Email ou nome de usuário já cadastrado' });

  if (usernameNorm) {
    const { data: existingUsername, error: usernameLookupError } = await supabase
      .from('users')
      .select('id')
      .eq('username', usernameNorm)
      .single();
    if (usernameLookupError && usernameLookupError.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Erro ao validar cadastro' });
    }
    if (existingUsername) return res.status(409).json({ error: 'Email ou nome de usuário já cadastrado' });
  }

  if (company) {
    const { data: existingCnpj, error: cnpjLookupError } = await supabase
      .from('users')
      .select('id')
      .eq('cnpj', normalizeCnpj(cnpj))
      .single();
    if (cnpjLookupError && cnpjLookupError.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Erro ao validar cadastro' });
    }
    if (existingCnpj) return res.status(409).json({ error: 'CNPJ já cadastrado' });
  }

  const hashed = await bcrypt.hash(password, 12);

  const newUser = { name, email: emailNorm, password_hash: hashed, phone, address, number, complement, city, state, zip_code, gender };
  if (usernameNorm) newUser.username = usernameNorm;
  if (company) newUser.cnpj = normalizeCnpj(cnpj);

  const { data, error } = await supabase
    .from('users')
    .insert(newUser)
    .select('id, name, email, phone, address, number, complement, city, state, zip_code, gender, cnpj, token_version')
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
      await supabase.from('users').delete().eq('id', data.id);
      return res.status(500).json({ error: 'Não foi possível criar a barbearia. Revise o endereço e tente novamente.' });
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
        if (svcErr) {
          console.error('Erro ao criar serviços:', svcErr);
          await supabase.from('barbershops').delete().eq('id', shop.id);
          await supabase.from('users').delete().eq('id', data.id);
          return res.status(500).json({ error: 'Não foi possível cadastrar os serviços da barbearia.' });
        }
      }
    }
  }

  const token = jwt.sign({ id: data.id, email: data.email, token_version: data.token_version || 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ user: { ...data, address: data.address || '', number: data.number || '', complement: data.complement || '', city: data.city || '', state: data.state || '' }, token, isCompany: company });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const identifier = String(email || '').trim();
  const normalized = identifier.toLowerCase();
    .from('users')
    return res.status(400).json({ error: 'E-mail/CNPJ e senha são obrigatórios' });
    .select('password_hash, token_version')
  }

  if (resetInsertError) {
    console.error('Falha ao registrar solicitação de redefinição:', resetInsertError.message);
    return res.json(genericMsg);
  }
  const cnpjIdentifier = normalizeCnpj(identifier);
  const isCnpjLogin = /^\d{14}$/.test(cnpjIdentifier) && isValidCnpj(cnpjIdentifier);
  const { data: user, error: loginError } = await supabase
    return res.json(genericMsg);
    .select('*')
    .eq(isCnpjLogin ? 'cnpj' : 'email', isCnpjLogin ? cnpjIdentifier : normalized)
    .single();

  const profileLimits = { name: 120, email: 254, phone: 32, address: 200, number: 20, complement: 100, city: 120, state: 2, zip_code: 16 };
  if (Object.entries(profileLimits).some(([field, limit]) => payload[field] && payload[field].length > limit)) {
    return res.status(400).json({ error: 'Um ou mais campos excedem o tamanho permitido' });
  }
  if (loginError && loginError.code !== 'PGRST116') return res.status(500).json({ error: 'Erro ao autenticar' });
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign({ id: user.id, email: user.email, token_version: user.token_version || 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, ...safeUser } = user;

  // Identificar empresa (CNPJ cadastrado)
  const isCompany = Boolean(user.cnpj && isValidCnpj(user.cnpj));

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

  const { data: user, error: lookupError } = await supabase
    .from('users')
    .select('id')
    .eq('email', emailNorm)
    .single();

  // Always respond with a generic message for security reasons
  const genericMsg = { message: 'Se o e-mail existir, você receberá instruções para redefinir a senha.' };

  if (lookupError && lookupError.code !== 'PGRST116') {
    console.error('Falha ao consultar solicitação de redefinição:', lookupError.message);
    return res.json(genericMsg);
  }
  if (!user) return res.json(genericMsg);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { error: resetInsertError } = await supabase
    .from('password_resets')
    .insert({ user_id: user.id, token: tokenHash, expires_at: expiresAt });
  if (resetInsertError) {
    console.error('Falha ao registrar solicitação de redefinição:', resetInsertError.message);
    return res.json(genericMsg);
  }

  try {
    await sendPasswordResetEmail(emailNorm, token);
  } catch (error) {
    await supabase.from('password_resets').delete().eq('token', tokenHash);
    console.error('Falha ao enviar e-mail de redefinição:', error.message);
    return res.json(genericMsg);
  }

  return res.json(genericMsg);
});

// POST /api/auth/reset
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token e nova senha são necessários' });
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres, com maiúscula, número e caractere especial' });
  }

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const hashed = await bcrypt.hash(password, 12);
  const { data: consumed, error } = await supabase.rpc('consume_password_reset', {
    p_token_hash: tokenHash,
    p_password_hash: hashed,
  });
  if (error) return res.status(500).json({ error: 'Erro ao redefinir senha' });
  if (!consumed) return res.status(400).json({ error: 'Token inválido ou expirado' });

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
  if (!isValidEmail(payload.email)) return res.status(400).json({ error: 'E-mail inválido' });
  if (!String(payload.phone || '').trim()) {
    return res.status(400).json({ error: 'O campo "Celular" é obrigatório' });
  }
  const profileLimits = { name: 120, email: 254, phone: 32, address: 200, number: 20, complement: 100, city: 120, state: 2, zip_code: 16 };
  if (Object.entries(profileLimits).some(([field, limit]) => payload[field] && payload[field].length > limit)) {
    return res.status(400).json({ error: 'Um ou mais campos excedem o tamanho permitido' });
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
  if (!isValidPassword(new_password)) {
    return res.status(400).json({ error: 'Nova senha deve ter de 8 a 128 caracteres, com maiúscula, número e caractere especial' });
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('password_hash, token_version')
    .eq('id', req.user.id)
    .single();

  if (userError) return res.status(500).json({ error: 'Erro ao validar usuário' });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

  const hashed = await bcrypt.hash(new_password, 12);
  const { error } = await supabase
    .from('users')
    .update({ password_hash: hashed, token_version: (user.token_version || 0) + 1 })
    .eq('id', req.user.id);
  if (error) return res.status(500).json({ error: 'Erro ao alterar senha' });

  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, token_version: (user.token_version || 0) + 1 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ message: 'Senha alterada com sucesso', token });
});

module.exports = router;
