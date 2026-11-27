/**
 * Regulariza o histórico do espelho automático de funcionários.
 *
 * Marca como `origem_exata = 1` as linhas de `qrcod_2023` que foram criadas
 * pela integração antes da coluna existir. O critério é conservador: cargo,
 * local e admissão vazios + matrícula presente em `funcionario_exata`.
 *
 * Sem `--aplicar` o script apenas lista os candidatos (dry-run).
 *
 * Uso:
 *   node scripts/exata-marcar-espelhos.js
 *   node scripts/exata-marcar-espelhos.js --aplicar
 *   node scripts/exata-marcar-espelhos.js --json
 */

const path = require('path');
const mysql = require('mysql2/promise');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // variáveis podem vir do ambiente
}

const { ensureExataSchema } = require('../exata-schema');

function lerArgumentos(argv = []) {
  return {
    aplicar: argv.includes('--aplicar'),
    json: argv.includes('--json'),
  };
}

async function buscarCandidatos(pool, contaId) {
  const [rows] = await pool.query(
    `SELECT q.id, q.matricula, q.nome, q.empresa_id, q.empresa, q.ativo,
            q.cargo, q.local, q.data_admissao
       FROM qrcod_2023 q
      WHERE q.origem_exata = 0
        AND (q.cargo IS NULL OR TRIM(q.cargo) = '')
        AND (q.local IS NULL OR TRIM(q.local) = '')
        AND q.data_admissao IS NULL
        AND EXISTS (
          SELECT 1
            FROM funcionario_exata fe
           WHERE fe.empresa_config_id = ?
             AND TRIM(fe.matricula) = TRIM(q.matricula)
        )
      ORDER BY q.matricula ASC`,
    [contaId]
  );
  return rows;
}

async function main() {
  const args = lerArgumentos(process.argv.slice(2));

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '192.168.200.136',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'dnpmix',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
    connectTimeout: 10000,
  });

  try {
    await ensureExataSchema(pool);

    const [contas] = await pool.query(
      `SELECT id, nome FROM empresas_config WHERE chave = 'exata' LIMIT 1`
    );
    if (contas.length === 0) {
      console.log('Conta ExataWeb não encontrada em empresas_config.');
      return;
    }
    const conta = contas[0];
    const candidatos = await buscarCandidatos(pool, conta.id);

    if (args.json) {
      console.log(JSON.stringify({ conta, total: candidatos.length, candidatos, aplicado: args.aplicar }, null, 2));
    } else {
      console.log(`Conta: ${conta.nome} (#${conta.id})`);
      console.log(`Candidatos a espelho automático: ${candidatos.length}`);
      for (const item of candidatos) {
        console.log(
          `  ${item.matricula}\t${item.nome || '-'}\t${item.empresa || 'sem empresa'}\t`
          + `id=${item.id}`
        );
      }
      if (candidatos.length === 0) {
        console.log('Nada a regularizar.');
      } else if (!args.aplicar) {
        console.log('\nDry-run: nada foi alterado. Rode com --aplicar para marcar origem_exata = 1.');
      }
    }

    if (!args.aplicar || candidatos.length === 0) return;

    const ids = candidatos.map((item) => item.id);
    const lote = 200;
    for (let i = 0; i < ids.length; i += lote) {
      const chunk = ids.slice(i, i + lote);
      await pool.query(
        'UPDATE qrcod_2023 SET origem_exata = 1 WHERE id IN (?)',
        [chunk]
      );
    }

    if (!args.json) {
      console.log(`\n${ids.length} registro(s) marcados com origem_exata = 1.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha:', error?.message || error);
  process.exitCode = 1;
});
