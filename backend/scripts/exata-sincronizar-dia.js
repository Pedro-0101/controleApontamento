/**
 * Importa os pontos de um dia (ou período) da ExataWeb para a base local.
 * Consulta tanto os pontos pendentes (status "N") quanto os já exportados
 * (status "S"), garantindo que o painel veja tudo, independentemente de outro
 * processo já ter feito a baixa.
 *
 * Uso:
 *   node scripts/exata-sincronizar-dia.js [AAAA-MM-DD] [AAAA-MM-DD]
 *
 * Sem argumentos, importa o dia de hoje. Nunca imprime token nem senha.
 */

const path = require('path');
const mysql = require('mysql2/promise');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // variáveis podem vir do ambiente
}

const { createExataApi } = require('../exata-api');
const { createExataSync } = require('../exata-sync');

function hojeIso() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

async function main() {
  const dataInicio = process.argv[2] || hojeIso();
  const dataFim = process.argv[3] || dataInicio;

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '192.168.200.136',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'dnpmix',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
  });

  try {
    const sync = createExataSync({ pool, exataApi: createExataApi() });
    console.log(`Importando pontos da ExataWeb de ${dataInicio} a ${dataFim}...`);

    const resultado = await sync.sincronizarPontos({
      modo: 'periodo',
      dataInicio,
      dataFim,
      qtde: 1000,
      usuario: 'diagnostico',
    });

    console.log('\nResultado:');
    console.log(JSON.stringify(resultado, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha:', error?.message || error);
  if (error?.status) console.error('HTTP status:', error.status);
  process.exitCode = 1;
});
