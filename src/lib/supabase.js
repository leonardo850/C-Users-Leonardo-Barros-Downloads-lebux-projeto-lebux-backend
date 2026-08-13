const { createClient } = require('@supabase/supabase-js');

let cachedClient;

const REQUEST_TIMEOUT_MS = 25000;

function timeoutFetch(input, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = init.signal;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return globalThis.fetch(input, { ...init, keepalive: false, signal: controller.signal })
    .then(res => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      return res;
    })
    .catch(err => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      throw err;
    });
}

function getSupabaseClient() {
  if (cachedClient) return cachedClient;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
  }

  cachedClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { fetch: timeoutFetch }
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
