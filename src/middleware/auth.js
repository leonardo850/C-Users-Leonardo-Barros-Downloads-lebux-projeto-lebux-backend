const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');

module.exports = async (req, res, next) => {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer') return res.status(401).json({ error: 'Token não fornecido' });
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase
      .from('users')
      .select('token_version')
      .eq('id', decoded.id)
      .maybeSingle();
    if (error) return res.status(503).json({ error: 'Não foi possível validar a sessão' });
    if (!user || decoded.token_version !== (user.token_version || 0)) {
      return res.status(401).json({ error: 'Sessão revogada. Entre novamente.' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};
