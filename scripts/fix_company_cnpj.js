require('dotenv').config();
const supabase = require('../src/lib/supabase');

function calcDigit(nums, weights) {
  let sum = 0;
  for (let i = 0; i < nums.length; i++) sum += nums[i] * weights[i];
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function generateCnpj() {
  const base = [];
  for (let i = 0; i < 8; i++) base.push(Math.floor(Math.random() * 10));
  base.push(0, 0, 0, 1);
  const d1 = calcDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join('');
}

(async () => {
  const { data: users } = await supabase.from('users').select('id, name, email, cnpj');
  if (!users) { console.log('Nenhum usuário encontrado'); return; }

  const companies = users.filter(u => u.cnpj);
  console.log(`Corrigindo CNPJs de ${companies.length} usuário(s) de empresa...`);

  for (const user of companies) {
    const cnpj = generateCnpj();
    const { error } = await supabase.from('users').update({ cnpj }).eq('id', user.id);
    if (error) {
      console.error('Erro ao atualizar', user.email, error.message);
    } else {
      console.log(`✔ ${user.name} | ${user.email} | CNPJ: ${cnpj}`);
    }
  }
})();
