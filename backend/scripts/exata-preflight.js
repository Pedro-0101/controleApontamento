/**
 * Pré-voo da integração ExataWeb (Fase 8 — encerramento assistido).
 *
 * Verifica, sem alterar nada:
 *   - variáveis de ambiente obrigatórias;
 *   - login/consulta real de empresas na Exata (opcional com --sem-api);
 *   - schema, conta, mapeamento de empresas, funcionários e marcações no banco;
 *   - baixas pendentes, duplicidades e últimas execuções auditadas.
 *
 * Uso:
 *   node scripts/exata-preflight.js [--json] [--sem-api]
 *
 * Saída: relatório legível (ou JSON) e código 1 quando há FALHA.
 * Nunca imprime usuário, senha ou token.
 */

const path = require('path');
const mysql = require('mysql2/promise');
const { createExataApi } = require('../exata-api');
const { sanitizarTexto } = require('../exata-observability');
const { baixarPontosHabilitado } = require('../exata-sync');

const TABELAS_OBRIGATORIAS = [
  'empresas_config',
  'empresas_exata',
  'funcionario_exata',
  'marcacoes_ponto',
  'marcacao_sync_estado_exata',
  'status_funcionario_exata',
  'sincronizacao_execucao',
];

const COLUNAS_OBRIGATORIAS = {
  empresas_config: ['provedor'],
  empresas_exata: ['empresasistema', 'empresa_id', 'ativo'],
  funcionario_exata: ['empresasistema', 'matricula'],
  marcacoes_ponto: [
    'provedor',
    'empresasistema',
    'reppid',
    'nsr',
    'status_exportacao',
    'data_marcacao',
  ],
};

const REQUISITOS_AMBIENTE = [
  { chave: 'EXATA_API_BASE_URL', nome: 'URL base da Exata' },
  { chave: 'EXATA_API_USER', nome: 'Usuário da Exata' },
  { chave: 'EXATA_API_PASSWORD', nome: 'Senha da Exata' },
];

function criarCheck(nome, status, detalhe = '') {
  return { nome, status, detalhe };
}

/** Severidade geral: qualquer FALHA prevalece; depois ATENCAO; senão OK. */
function statusGeral(checks) {
  const lista = Array.isArray(checks) ? checks : [];
  if (lista.some((item) => item?.status === 'FALHA')) return 'FALHA';
  if (lista.some((item) => item?.status === 'ATENCAO')) return 'ATENCAO';
  return 'OK';
}

/** Resume as empresas descobertas (linhas de `empresas_exata`). */
function resumirEmpresasExata(empresas) {
  const lista = Array.isArray(empresas) ? empresas : [];
  const resumo = {
    total: lista.length,
    mapeadas: 0,
    semMapeamento: 0,
    inativas: 0,
  };

  for (const empresa of lista) {
    if (empresa?.empresa_id === null || empresa?.empresa_id === undefined || empresa?.empresa_id === '') {
      resumo.semMapeamento++;
    } else {
      resumo.mapeadas++;
    }
    if (Number(empresa?.ativo) === 0) resumo.inativas++;
  }

  return resumo;
}

/** Resume marcações por status de exportação. */
function resumirMarcacoes(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  const resumo = { total: 0, exportadas: 0, pendentes: 0, outros: 0 };

  for (const row of lista) {
    const total = Number(row?.total) || 0;
    resumo.total += total;
    if (row?.status_exportacao === 'S') resumo.exportadas += total;
    else if (row?.status_exportacao === 'N') resumo.pendentes += total;
    else resumo.outros += total;
  }

  return resumo;
}

/** Compara empresas retornadas pela API com as já persistidas no banco. */
function compararEmpresas(apiEmpresas, bancoEmpresas) {
  const naApi = new Set(
    (Array.isArray(apiEmpresas) ? apiEmpresas : [])
      .map((item) => Number(item?.empresasistema))
      .filter(Number.isInteger)
  );
  const noBanco = new Set(
    (Array.isArray(bancoEmpresas) ? bancoEmpresas : [])
      .map((item) => Number(item?.empresasistema))
      .filter(Number.isInteger)
  );

  return {
    api: naApi.size,
    banco: noBanco.size,
    ausentesNoBanco: [...naApi].filter((item) => !noBanco.has(item)).sort((a, b) => a - b),
    ausentesNaApi: [...noBanco].filter((item) => !naApi.has(item)).sort((a, b) => a - b),
  };
}

function formatarCheck(check) {
  const rotulo = check.status === 'OK' ? '[OK]' : (check.status === 'ATENCAO' ? '[ATENÇÃO]' : '[FALHA]');
  return `${rotulo} ${check.nome}${check.detalhe ? ` — ${check.detalhe}` : ''}`;
}

/** Monta o relatório textual do pré-voo. */
function formatarRelatorio(resultado) {
  const linhas = [];
  linhas.push('Pré-voo da integração ExataWeb');
  if (resultado?.geradoEm) linhas.push(`Gerado em: ${resultado.geradoEm}`);
  linhas.push(`Status geral: ${resultado?.status || 'FALHA'}`);
  linhas.push('');

  for (const check of resultado?.checks || []) {
    linhas.push(formatarCheck(check));
  }

  if (resultado?.empresas) {
    const e = resultado.empresas;
    linhas.push('');
    linhas.push(
      `Empresas: ${e.total} no banco | ${e.mapeadas} mapeadas | ${e.semMapeamento} sem empresa local | ${e.inativas} inativas`
    );
  }

  if (resultado?.marcacoes) {
    const m = resultado.marcacoes;
    linhas.push(
      `Marcações Exata: ${m.total} no total | ${m.exportadas} exportadas | ${m.pendentes} pendentes de baixa | ${m.outros} sem status`
    );
  }

  if (resultado?.comparacao && resultado.comparacao.api > 0) {
    const c = resultado.comparacao;
    linhas.push(
      `Comparação API × banco: ${c.api} empresas na API | ${c.banco} no banco`
    );
    if (c.ausentesNoBanco.length > 0) {
      linhas.push(`  Ausentes no banco: ${c.ausentesNoBanco.join(', ')}`);
    }
    if (c.ausentesNaApi.length > 0) {
      linhas.push(`  Somente no banco: ${c.ausentesNaApi.join(', ')}`);
    }
  }

  const execucoes = resultado?.execucoes || [];
  if (execucoes.length > 0) {
    linhas.push('');
    linhas.push('Últimas execuções:');
    for (const execucao of execucoes) {
      linhas.push(
        `  #${execucao.id} ${execucao.tipo} ${execucao.status}`
        + ` empresas=${execucao.empresas_processadas ?? 0}`
        + (execucao.erro ? ` erro=${execucao.erro}` : '')
      );
    }
  }

  const proximosPassos = resultado?.proximosPassos || [];
  if (proximosPassos.length > 0) {
    linhas.push('');
    linhas.push('Próximos passos:');
    for (const passo of proximosPassos) linhas.push(`  - ${passo}`);
  }

  return linhas.join('\n');
}

function parseArgs(argv = []) {
  const args = { json: false, semApi: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--sem-api') args.semApi = true;
  }
  return args;
}

function criarPool(env = process.env) {
  return mysql.createPool({
    host: env.DB_HOST || '192.168.200.136',
    port: Number(env.DB_PORT) || 3306,
    database: env.DB_NAME || 'dnpmix',
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    charset: 'utf8mb4',
    connectTimeout: 10000,
  });
}

async function tabelaExiste(pool, tabela) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [tabela]
  );
  return rows.length > 0;
}

async function colunasExistentes(pool, tabela) {
  const [rows] = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [tabela]
  );
  return new Set(rows.map((row) => String(row.column_name).toLowerCase()));
}

async function verificarSchema(pool, checks) {
  const faltando = [];
  for (const tabela of TABELAS_OBRIGATORIAS) {
    if (!(await tabelaExiste(pool, tabela))) faltando.push(tabela);
  }
  checks.push(
    faltando.length === 0
      ? criarCheck('Schema da integração', 'OK', 'todas as tabelas presentes')
      : criarCheck('Schema da integração', 'FALHA', `tabelas ausentes: ${faltando.join(', ')}`)
  );

  const colunasFaltando = [];
  for (const [tabela, colunas] of Object.entries(COLUNAS_OBRIGATORIAS)) {
    if (faltando.includes(tabela)) continue;
    const existentes = await colunasExistentes(pool, tabela);
    for (const coluna of colunas) {
      if (!existentes.has(coluna.toLowerCase())) colunasFaltando.push(`${tabela}.${coluna}`);
    }
  }
  if (colunasFaltando.length > 0) {
    checks.push(
      criarCheck('Colunas da integração', 'FALHA', `colunas ausentes: ${colunasFaltando.join(', ')}`)
    );
  }

  return faltando.length === 0 && colunasFaltando.length === 0;
}

async function consultarBanco(pool, checks, resultado) {
  const [contas] = await pool.query(
    `SELECT id, nome, ativo FROM empresas_config WHERE chave = 'exata' LIMIT 1`
  );
  const conta = contas[0] || null;
  if (!conta) {
    checks.push(criarCheck('Conta ExataWeb', 'FALHA', "registro com chave = 'exata' não encontrado"));
    return;
  }
  checks.push(
    criarCheck(
      'Conta ExataWeb',
      Number(conta.ativo) === 1 ? 'OK' : 'ATENCAO',
      `empresa_config_id=${conta.id}${Number(conta.ativo) === 1 ? '' : ' (desativada — rollback ativo)'}`
    )
  );

  const [empresas] = await pool.query(
    `SELECT empresasistema, empresa_id, ativo FROM empresas_exata WHERE empresa_config_id = ?`,
    [conta.id]
  );
  resultado.empresas = resumirEmpresasExata(empresas);
  checks.push(
    resultado.empresas.semMapeamento === 0
      ? criarCheck('Mapeamento de empresas', 'OK', `${resultado.empresas.mapeadas} mapeadas`)
      : criarCheck(
        'Mapeamento de empresas',
        'ATENCAO',
        `${resultado.empresas.semMapeamento} empresa(s) sem empresa local`
      )
  );

  const [funcionarios] = await pool.query(
    `SELECT COUNT(*) AS total FROM funcionario_exata WHERE empresa_config_id = ?`,
    [conta.id]
  );
  checks.push(
    criarCheck(
      'Funcionários importados',
      Number(funcionarios[0]?.total) > 0 ? 'OK' : 'ATENCAO',
      `${Number(funcionarios[0]?.total) || 0} registro(s)`
    )
  );

  const [marcacoes] = await pool.query(
    `SELECT status_exportacao, COUNT(*) AS total
       FROM marcacoes_ponto
      WHERE empresa_config_id = ? AND provedor = 'exata'
      GROUP BY status_exportacao`,
    [conta.id]
  );
  resultado.marcacoes = resumirMarcacoes(marcacoes);
  if (!baixarPontosHabilitado()) {
    checks.push(
      criarCheck(
        'Baixas pendentes',
        'OK',
        `baixa desativada (EXATA_BAIXAR_PONTOS=0); ${resultado.marcacoes.pendentes} marcação(ões) permanecem na Exata`
      )
    );
  } else {
    checks.push(
      resultado.marcacoes.pendentes === 0
        ? criarCheck('Baixas pendentes', 'OK', `${resultado.marcacoes.exportadas} exportada(s)`)
        : criarCheck(
          'Baixas pendentes',
          'ATENCAO',
          `${resultado.marcacoes.pendentes} marcação(ões) aguardando baixa`
        )
    );
  }

  const [duplicadas] = await pool.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT 1
         FROM marcacoes_ponto
        WHERE empresa_config_id = ? AND provedor = 'exata'
        GROUP BY empresasistema, reppid, nsr
       HAVING COUNT(*) > 1
     ) AS dup`,
    [conta.id]
  );
  const totalDuplicadas = Number(duplicadas[0]?.total) || 0;
  checks.push(
    totalDuplicadas === 0
      ? criarCheck('Duplicidades', 'OK', 'nenhuma chave repetida')
      : criarCheck('Duplicidades', 'FALHA', `${totalDuplicadas} chave(s) duplicada(s)`)
  );

  const [execucoes] = await pool.query(
    `SELECT id, tipo, status, empresas_processadas, erro
       FROM sincronizacao_execucao
      WHERE tipo LIKE 'EXATA_%'
      ORDER BY id DESC
      LIMIT 5`
  );
  resultado.execucoes = execucoes;
  const comErro = execucoes.filter((item) => item.status === 'ERRO').length;
  checks.push(
    comErro === 0
      ? criarCheck('Execuções recentes', 'OK', `${execucoes.length} execução(ões) analisada(s)`)
      : criarCheck('Execuções recentes', 'ATENCAO', `${comErro} execução(ões) com ERRO`)
  );

  resultado.bancoEmpresas = empresas;
  resultado.conta = conta;
}

async function consultarApi(checks, resultado, segredos) {
  try {
    const api = createExataApi();
    const empresas = await api.listarEmpresas();
    if (!Array.isArray(empresas)) {
      checks.push(criarCheck('Conexão com a Exata', 'FALHA', 'resposta de /empresas não é uma lista'));
      return;
    }
    checks.push(
      criarCheck('Conexão com a Exata', empresas.length > 0 ? 'OK' : 'ATENCAO', `${empresas.length} empresa(s) na conta`)
    );
    resultado.apiEmpresas = empresas;
  } catch (error) {
    const mensagem = sanitizarTexto(error?.message || String(error), segredos).slice(0, 500);
    checks.push(criarCheck('Conexão com a Exata', 'FALHA', mensagem));
  }
}

function proximosPassos(resultado) {
  const passos = [];
  const status = new Map((resultado.checks || []).map((item) => [item.nome, item]));

  if (status.get('Conexão com a Exata')?.status === 'FALHA') {
    passos.push('Conferir EXATA_API_BASE_URL, EXATA_API_USER e EXATA_API_PASSWORD no backend/.env.');
  }
  if (
    status.get('Banco de dados')?.status === 'FALHA'
    || status.get('Schema da integração')?.status === 'FALHA'
    || status.get('Colunas da integração')?.status === 'FALHA'
  ) {
    passos.push('Conferir as variáveis DB_* e reiniciar o backend para aplicar as migrações da Exata.');
  }
  if (status.get('Mapeamento de empresas')?.status === 'ATENCAO') {
    passos.push('Mapear as empresas sem empresa local em Configurações → Empresas da API.');
  }
  if (status.get('Funcionários importados')?.status === 'ATENCAO') {
    passos.push('Executar a sincronização de funcionários antes de validar os pontos.');
  }
  if (baixarPontosHabilitado() && status.get('Baixas pendentes')?.status === 'ATENCAO') {
    passos.push('Reprocessar a importação de pontos para confirmar as baixas pendentes.');
  }
  if (status.get('Conta ExataWeb')?.status === 'ATENCAO') {
    passos.push('A conta está desativada (rollback); reative-a para sincronizar.');
  }
  if (passos.length === 0) {
    passos.push('Executar o rollout e entregar as contagens por empresa/dia ao solicitante.');
  }
  return passos;
}

async function executarPreflight({ argv = process.argv.slice(2), env = process.env } = {}) {
  const args = parseArgs(argv);
  const checks = [];
  const resultado = {
    geradoEm: new Date().toISOString(),
    status: 'OK',
    checks,
  };

  for (const requisito of REQUISITOS_AMBIENTE) {
    const presente = Boolean(String(env[requisito.chave] || '').trim());
    checks.push(
      presente
        ? criarCheck(requisito.nome, 'OK', 'configurado')
        : criarCheck(requisito.nome, 'FALHA', `${requisito.chave} ausente`)
    );
  }

  const segredos = [env.EXATA_API_USER, env.EXATA_API_PASSWORD].filter(Boolean);

  if (!args.semApi) {
    await consultarApi(checks, resultado, segredos);
  }

  let pool = null;
  try {
    pool = criarPool(env);
    const schemaOk = await verificarSchema(pool, checks);
    if (schemaOk) await consultarBanco(pool, checks, resultado);

    if (resultado.apiEmpresas && resultado.bancoEmpresas) {
      resultado.comparacao = compararEmpresas(resultado.apiEmpresas, resultado.bancoEmpresas);
      const c = resultado.comparacao;
      if (c.ausentesNoBanco.length > 0) {
        checks.push(
          criarCheck(
            'Empresas descobertas',
            'ATENCAO',
            `${c.ausentesNoBanco.length} empresa(s) da API ainda não sincronizada(s)`
          )
        );
      }
    }
  } catch (error) {
    const mensagem = sanitizarTexto(error?.message || String(error), segredos).slice(0, 500);
    checks.push(criarCheck('Banco de dados', 'FALHA', mensagem));
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        // Encerramento best-effort; não altera o resultado do pré-voo.
      }
    }
  }

  delete resultado.apiEmpresas;
  delete resultado.bancoEmpresas;
  resultado.status = statusGeral(checks);
  resultado.proximosPassos = proximosPassos(resultado);
  resultado.config = {
    baseUrl: String(env.EXATA_API_BASE_URL || '').trim() ? 'configurada' : 'ausente',
    usuario: String(env.EXATA_API_USER || '').trim() ? 'configurado' : 'ausente',
  };
  return resultado;
}

async function main() {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch {
    // .env é opcional; as variáveis podem vir do ambiente.
  }

  const args = parseArgs(process.argv.slice(2));
  const resultado = await executarPreflight();

  if (args.json) {
    console.log(JSON.stringify(resultado, null, 2));
  } else {
    console.log(formatarRelatorio(resultado));
  }

  if (resultado.status === 'FALHA') process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Falha inesperada no pré-voo:', error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  executarPreflight,
  formatarRelatorio,
  statusGeral,
  resumirEmpresasExata,
  resumirMarcacoes,
  compararEmpresas,
  parseArgs,
};
