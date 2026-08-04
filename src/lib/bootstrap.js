const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

function validateEnvironment({ env = process.env } = {}) {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET'];
  const missing = required.filter((key) => !env[key]);

  if (missing.length) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }

  if (env.NODE_ENV !== 'test' && !env.FRONTEND_URL) {
    console.warn('FRONTEND_URL não definido. Usando fallback local.');
  }

  return true;
}

function getDemoSeedConfig({ env = process.env } = {}) {
  const enabled = env.ENABLE_DEMO_SEED === 'true';

  return {
    enabled,
    admin: {
      email: env.DEMO_ADMIN_EMAIL || 'lebuxapp@gmail.com',
      password: env.DEMO_ADMIN_PASSWORD || '',
      name: env.DEMO_ADMIN_NAME || 'Admin Lebux',
    },
    company: {
      email: env.DEMO_COMPANY_EMAIL || 'empresa@lebux.com',
      password: env.DEMO_COMPANY_PASSWORD || '',
      name: env.DEMO_COMPANY_NAME || 'Barbearia do Leonardo',
    },
  };
}

async function ensureSeedUsers() {
  const config = getDemoSeedConfig();
  if (!config.enabled) {
    return { skipped: true };
  }

  if (!config.admin.password || !config.company.password) {
    console.warn('Seed demo desativado: senhas demo não configuradas.');
    return { skipped: true };
  }

  const adminEmail = config.admin.email;
  const companyEmail = config.company.email;

  const adminPassword = config.admin.password;
  const companyPassword = config.company.password;

  const { data: existingAdmin } = await supabase
    .from('users')
    .select('*')
    .eq('email', adminEmail)
    .single();

  if (!existingAdmin) {
    const hashed = await bcrypt.hash(adminPassword, 12);
    await supabase.from('users').insert({
      name: config.admin.name,
      email: adminEmail,
      password_hash: hashed,
    });
  }

  const { data: existingCompany } = await supabase
    .from('users')
    .select('*')
    .eq('email', companyEmail)
    .single();

  if (!existingCompany) {
    const hashed = await bcrypt.hash(companyPassword, 12);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        name: config.company.name,
        email: companyEmail,
        password_hash: hashed,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Erro ao criar usuário empresa:', error);
      return { skipped: false, error };
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
  }

  return { skipped: false };
}

module.exports = {
  validateEnvironment,
  getDemoSeedConfig,
  ensureSeedUsers,
};
