/**
 * Relatório de cobertura de funcionários da ExataWeb.
 *
 * Mostra quais funcionários a API retorna e como cada matrícula está (ou não)
 * cadastrada no cadastro local (`qrcod_2023`). É somente leitura: não altera
 * nenhuma tabela.
 *
 * Uso:
 *   node scripts/exata-cobertura.js
 *   node scripts/exata-cobertura.js --situacao NAO_CADASTRADO
 *   node scripts/exata-cobertura.js --empresa 1 --busca silva
 *   node scripts/exata-cobertura.js --csv > cobertura.csv
 *   node scripts/exata-cobertura.js --json
 */

const path = require('path');
const mysql = require('mysql2/promise');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // variáveis podem vir do ambiente
}

const { createExataSync, gerarCsvCoberturaFuncionarios } = require('../exata-sync');

function lerArgumentos(argv = []) {
  const args = { csv: false, json: false, situacao: '', empresa: '', busca: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--csv') args.csv = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--situacao') args.situacao = argv[++i] || '';
    else if (arg.startsWith('--situacao=')) args.situacao = arg.slice('--situacao='.length);
    else if (arg === '--empresa') args.empresa = argv[++i] || '';
    else if (arg.startsWith('--empresa=')) args.empresa = arg.slice('--empresa='.length);
    else if (arg === '--busca') args.busca = argv[++i] || '';
    else if (arg.startsWith('--busca=')) args.busca = arg.slice('--busca='.length);
  }
  return args;
}

function formatarResumo(resumo) {
  const linhas = [];
  linhas.push(`Total na API: ${resumo.total}`);
  for (const [situacao, total] of Object.entries(resumo.porSituacao || {})) {
    if (total > 0) linhas.push(`  ${situacao}: ${total}`);
  }
  const alertas = Object.entries(resumo.alertas || {}).filter(([, total]) => total > 0);
  if (alertas.length > 0) {
    linhas.push('Alertas:');
    for (const [alerta, total] of alertas) linhas.push(`  ${alerta}: ${total}`);
  }
  return linhas.join('\n');
}

function formatarLinha(item) {
  const local = item.cadastro_local;
  const destino = local
    ? `local ${local.id} (${local.empresa || 'sem empresa'}${local.ativo ? '' : ', inativo'})`
    : 'sem cadastro local';
  const alertas = item.alertas?.length ? ` [${item.alertas.join(', ')}]` : '';
  return `${item.matricula}\t${item.nome_exata || '-'}\t${item.empresa_exata}\t${item.situacao_cadastro}\t${destino}${alertas}`;
}

async function main() {
  const args = lerArgumentos(process.argv.slice(2));
  const empresaId = Number(args.empresa);

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
    // A cobertura usa apenas o banco; o cliente da API não é chamado.
    const sync = createExataSync({ pool, exataApi: {} });
    const resultado = await sync.relatorioCoberturaFuncionarios({
      empresasExataIds: Number.isFinite(empresaId) && empresaId > 0 ? [empresaId] : undefined,
      situacao: args.situacao,
      busca: args.busca,
      semPaginacao: true,
    });

    if (args.csv) {
      process.stdout.write(`${gerarCsvCoberturaFuncionarios(resultado)}\n`);
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(resultado, null, 2));
      return;
    }

    console.log(formatarResumo(resultado.resumo));
    console.log('');
    if (resultado.funcionarios.length === 0) {
      console.log('Nenhum funcionário para os filtros informados.');
      return;
    }
    console.log('Matrícula\tNome\tEmpresa Exata\tSituação\tDestino');
    for (const item of resultado.funcionarios) {
      console.log(formatarLinha(item));
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha:', error?.message || error);
  process.exitCode = 1;
});
