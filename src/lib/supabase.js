const { createClient } = require('@supabase/supabase-js');

let cachedClient;

function getSupabaseClient() {
  if (cachedClient) return cachedClient;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
  }

  cachedClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  return cachedClient;
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    return getSupabaseClient()[prop];
  },
  apply(_target, _thisArg, args) {
    return getSupabaseClient().apply(null, args);
  },
});
