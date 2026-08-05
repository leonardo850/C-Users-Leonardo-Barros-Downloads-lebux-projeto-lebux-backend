require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../src/lib/supabase');

const FICTIONAL_PASSWORD = 'Empresa@123';

function slugify(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function generateCnpj() {
  const base = [];
  for (let i = 0; i < 8; i++) base.push(Math.floor(Math.random() * 10));
  base.push(0, 0, 0, 1);
  const calcDigit = (nums, weights) => {
    let sum = 0;
    for (let i = 0; i < nums.length; i++) sum += nums[i] * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calcDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join('');
}

async function getExisting() {
  const { data: shops, error: shopErr } = await supabase.from('barbershops').select('*');
  if (shopErr) throw new Error(`Erro ao buscar barbearias: ${shopErr.message}`);
  const { data: users, error: userErr } = await supabase.from('users').select('*');
  if (userErr) throw new Error(`Erro ao buscar usuários: ${userErr.message}`);
  return { shops: shops || [], users: users || [] };
}

function chooseKeeper(group) {
  return group.find(s => s.owner_id) || group.slice().sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0];
}

async function consolidateDuplicates(shops) {
  const groups = new Map();
  for (const shop of shops) {
    const key = slugify(shop.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shop);
  }

  let removed = 0;
  const kept = [];

  for (const group of groups.values()) {
    if (group.length === 1) { kept.push(group[0]); continue; }
    const keeper = chooseKeeper(group);
    const dups = group.filter(s => s.id !== keeper.id);

    for (const dup of dups) {
      const { error: reAssignErr } = await supabase
        .from('appointments')
        .update({ barbershop_id: keeper.id })
        .eq('barbershop_id', dup.id);
      if (reAssignErr) throw new Error(`Erro ao mover agendamentos: ${reAssignErr.message}`);

      const { error: deleteErr } = await supabase
        .from('barbershops')
        .delete()
        .eq('id', dup.id);
      if (deleteErr) throw new Error(`Erro ao remover duplicada ${dup.name}: ${deleteErr.message}`);
      removed++;
      console.log(`🗑️  Duplicada removida: ${dup.name} (${dup.id})`);
    }
    kept.push(keeper);
  }

  return { kept, removed };
}

async function ensureOwner(shop, users, created, updated) {
  const existingOwner = shop.owner_id ? users.find(u => u.id === shop.owner_id) : null;
  const usedCnpjs = new Set(users.map(u => u.cnpj).filter(Boolean));
  const usedEmails = new Set(users.map(u => String(u.email || '').toLowerCase()));

  if (existingOwner && existingOwner.cnpj) {
    return { user: existingOwner, action: 'ok' };
  }

  const baseEmail = `contato.${slugify(shop.name)}@lebux.com`;

  let email = baseEmail;
  let counter = 2;
  while (usedEmails.has(email)) {
    email = baseEmail.replace('@', `${counter}@`);
    counter++;
  }

  let cnpj = generateCnpj();
  while (usedCnpjs.has(cnpj)) cnpj = generateCnpj();

  if (existingOwner) {
    const { data, error } = await supabase
      .from('users')
      .update({ cnpj, role: 'company' })
      .eq('id', existingOwner.id)
      .select('id, name, email, cnpj, role, phone');
    if (error) throw new Error(`Erro ao atualizar ${existingOwner.name}: ${error.message}`);
    updated.push(data[0]);
    return { user: data[0], action: 'updated' };
  }

  const hashed = await bcrypt.hash(FICTIONAL_PASSWORD, 12);
  const { data, error } = await supabase
    .from('users')
    .insert({
      name: shop.name,
      email,
      phone: shop.phone || null,
      cnpj,
      role: 'company',
      address: shop.address || null,
      city: shop.city || null,
      state: shop.state || null,
      password_hash: hashed,
    })
    .select('id, name, email, cnpj, role, phone')
    .single();

  if (error) throw new Error(`Erro ao criar usuário de ${shop.name}: ${error.message}`);

  const { error: linkErr } = await supabase
    .from('barbershops')
    .update({ owner_id: data.id })
    .eq('id', shop.id);
  if (linkErr) throw new Error(`Erro ao vincular dono a ${shop.name}: ${linkErr.message}`);

  created.push(data[0]);
  return { user: data[0], action: 'created' };
}

(async () => {
  try {
    const { shops, users } = await getExisting();
    console.log(`Encontradas ${shops.length} barbearias e ${users.length} usuários.`);

    const { kept, removed } = await consolidateDuplicates(shops);
    console.log(`Consolidação concluída: ${removed} duplicadas removidas, ${kept.length} barbearias únicas.`);

    const created = [];
    const updated = [];

    for (const shop of kept) {
      await ensureOwner(shop, users, created, updated);
    }

    console.log(`\n✅ ${created.length} usuário(s) fictício(s) criado(s), ${updated.length} atualizado(s).`);
    console.log('\n=== USUÁRIOS DE EMPRESA (senha padrão: ' + FICTIONAL_PASSWORD + ') ===');
    [...created, ...updated].forEach(u => {
      console.log(`- ${u.name} | ${u.email} | CNPJ: ${u.cnpj}`);
    });
  } catch (err) {
    console.error('\n❌', err.message);
    process.exit(1);
  }
})();
