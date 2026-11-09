/**
 * Testes de fluxo da sincronização de pontos da Exata sem banco real.
 *
 * Usam um pool fake mínimo (apenas as consultas usadas pelo fluxo de pontos) e
 * um fake da API Exata que permite simular falha na baixa (`baixaponto671`).
 * Cobrem idempotência, recuperação de falha na baixa e observabilidade.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createExataSync } = require('./exata-sync');

const CONTA = { id: 1, nome: 'ExataWeb', chave: 'exata', ativo: 1, provedor: 'exata' };
const EMPRESA_EXATA = {
  id: 1,
  empresa_config_id: CONTA.id,
  empresasistema: 7,
  descricao: 'EMPRESA TESTE',
  empresa_id: 3,
  ativo: 1,
};

const PONTOS = [
  {
    empresa: 7,
    nsr: 1001,
    reppid: 12,
    data: '09/11/2026',
    hora: '08:00',
    matricula: '000123',
    status: 'N',
  },
  {
    empresa: 7,
    nsr: 1002,
    reppid: 12,
    data: '09/11/2026',
    hora: '12:00',
    matricula: '000123',
    status: 'N',
  },
];

function normalizarSql(sql) {
  return String(sql).toLowerCase().replace(/\s+/g, ' ').trim();
}

function extrairColunas(sql, tabela) {
  const match = String(sql).match(
    new RegExp(`insert\\s+into\\s+\`?${tabela}\`?\\s*\\(([^)]+)\\)`, 'i')
  );
  if (!match) return [];
  return match[1].split(',').map((coluna) => coluna.trim().replace(/`/g, ''));
}

function chaveMarcacao(config, sistema, reppid, nsr) {
  return `${config}:${sistema}:${reppid}:${nsr}`;
}

function createFakePool({ conta = CONTA, empresas = [EMPRESA_EXATA] } = {}) {
  const state = {
    conta,
    empresas,
    marcacoes: new Map(),
    estados: new Map(),
    execucoes: [],
  };

  async function query(sql, params = []) {
    const texto = normalizarSql(sql);

    // Migrações: o schema real não é necessário para o fluxo testado.
    if (texto.includes('from information_schema')) return [[]];
    if (texto.startsWith('create table') || texto.startsWith('alter table')) return [{}];

    if (texto.includes('insert into empresas_config')) {
      return [{ insertId: state.conta.id }];
    }
    if (texto.includes('from empresas_config')) {
      return [[state.conta]];
    }

    if (texto.includes('insert into marcacao_sync_estado_exata')) {
      const [config, sistema, ultimaData, ultimoNsr, ultimoReppid, ultimoTotal] = params;
      const chave = `${config}:${sistema}`;
      const atual = state.estados.get(chave) || {};
      state.estados.set(chave, {
        empresa_config_id: config,
        empresasistema: sistema,
        ultima_data: ultimaData || atual.ultima_data || null,
        ultimo_nsr: Math.max(Number(ultimoNsr) || 0, Number(atual.ultimo_nsr) || 0),
        ultimo_reppid: ultimoReppid ?? atual.ultimo_reppid ?? null,
        ultimo_total: Number(ultimoTotal) || 0,
      });
      return [{}];
    }
    if (texto.includes('from marcacao_sync_estado_exata')) {
      const [config, sistema] = params;
      const estado = state.estados.get(`${config}:${sistema}`);
      return [estado ? [estado] : []];
    }

    if (texto.includes('from empresas_exata')) {
      const [config, ids] = params;
      let rows = state.empresas.filter(
        (empresa) => Number(empresa.empresa_config_id) === Number(config)
      );
      if (texto.includes('and ativo = 1')) {
        rows = rows.filter((empresa) => Number(empresa.ativo) === 1);
      }
      if (Array.isArray(ids)) {
        const permitidos = ids.map(Number);
        rows = rows.filter((empresa) => permitidos.includes(Number(empresa.id)));
      }
      return [rows];
    }

    // Funcionários locais: nos testes não há espelho em qrcod_2023.
    if (texto.includes('from qrcod_2023')) return [[]];

    if (texto.includes('insert into marcacoes_ponto')) {
      const colunas = extrairColunas(sql, 'marcacoes_ponto');
      const values = params[0] || [];
      for (const linha of values) {
        const row = {};
        colunas.forEach((coluna, indice) => {
          row[coluna] = linha[indice];
        });
        state.marcacoes.set(
          chaveMarcacao(row.empresa_config_id, row.empresasistema, row.reppid, row.nsr),
          row
        );
      }
      return [{ affectedRows: values.length }];
    }

    if (texto.includes('update marcacoes_ponto')) {
      const [status, config, sistema, ...pares] = params;
      let afetadas = 0;
      for (let i = 0; i < pares.length; i += 2) {
        const row = state.marcacoes.get(chaveMarcacao(config, sistema, pares[i], pares[i + 1]));
        if (row) {
          row.status_exportacao = status;
          afetadas++;
        }
      }
      return [{ affectedRows: afetadas }];
    }

    if (texto.includes('from marcacoes_ponto')) {
      const [config, sistema, ...pares] = params;
      const rows = [];
      for (let i = 0; i < pares.length; i += 2) {
        const row = state.marcacoes.get(chaveMarcacao(config, sistema, pares[i], pares[i + 1]));
        if (row) rows.push({ reppid: row.reppid, nsr: row.nsr });
      }
      return [rows];
    }

    if (texto.includes('insert into sincronizacao_execucao')) {
      state.execucoes.push({ params });
      return [{ insertId: state.execucoes.length }];
    }

    return [[]];
  }

  return { state, query };
}

function brParaIso(data) {
  const match = String(data).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(data);
}

function isoParaBr(data) {
  const match = String(data).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(data);
}

function createFakeExataApi({ pontos = PONTOS } = {}) {
  const exportados = new Set();
  const baixas = [];
  let falhasBaixa = 0;

  const chave = (ponto) => `${ponto.empresa}:${ponto.reppid}:${ponto.nsr}`;

  return {
    exportados,
    baixas,
    falharProximaBaixa() {
      falhasBaixa++;
    },
    limparExportados() {
      exportados.clear();
    },
    async buscarPontos({ empresa, dtInicial, dtFinal }) {
      const inicio = brParaIso(dtInicial);
      const fim = brParaIso(dtFinal);
      return pontos.filter((ponto) => {
        const dia = brParaIso(ponto.data);
        return Number(ponto.empresa) === Number(empresa)
          && dia >= inicio
          && dia <= fim
          && !exportados.has(chave(ponto));
      });
    },
    async confirmarPontos(lista) {
      if (falhasBaixa > 0) {
        falhasBaixa--;
        throw new Error('Falha simulada na baixa');
      }
      for (const ponto of lista) {
        exportados.add(chave(ponto));
        baixas.push({ ...ponto });
      }
      return { retorno: 'OK' };
    },
  };
}

function setup() {
  const pool = createFakePool();
  const exataApi = createFakeExataApi();
  const sync = createExataSync({ pool, exataApi });
  return { pool, exataApi, sync };
}

function carregarPeriodo(sync) {
  return sync.sincronizarPontos({
    modo: 'periodo',
    dataInicio: '2026-11-09',
    dataFim: '2026-11-09',
  });
}

test('reexecutar a mesma carga não cria duplicatas (upsert idempotente)', async () => {
  const { pool, exataApi, sync } = setup();

  const primeira = await carregarPeriodo(sync);
  assert.equal(primeira.success, true);
  assert.equal(primeira.buscados, 2);
  assert.equal(primeira.inseridos, 2);
  assert.equal(primeira.baixados, 2);
  assert.equal(primeira.metricas.persistidos, 2);
  assert.equal(pool.state.marcacoes.size, 2);

  // Simula a API devolvendo os mesmos pontos novamente (como se a baixa não
  // tivesse sido refletida do lado da Exata).
  exataApi.limparExportados();
  const segunda = await carregarPeriodo(sync);

  assert.equal(segunda.success, true);
  assert.equal(segunda.buscados, 2);
  assert.equal(segunda.inseridos, 0);
  assert.equal(segunda.atualizados, 2);
  assert.equal(segunda.baixados, 2);
  assert.equal(pool.state.marcacoes.size, 2, 'nenhuma duplicata criada');
  assert.equal(pool.state.execucoes.length, 2);
});

test('falha na baixa preserva os dados e é recuperada na execução seguinte', async () => {
  const { pool, exataApi, sync } = setup();
  exataApi.falharProximaBaixa();

  const comFalha = await carregarPeriodo(sync);
  assert.equal(comFalha.success, false);
  // Com uma única empresa e falha de baixa, a execução é integralmente ERRO.
  assert.equal(comFalha.status, 'ERRO');
  assert.equal(comFalha.buscados, 2);
  assert.equal(comFalha.inseridos, 2);
  assert.equal(comFalha.baixados, 0);
  assert.equal(comFalha.erros, 1);
  assert.equal(pool.state.marcacoes.size, 2, 'dados persistidos mesmo com falha na baixa');
  for (const marcacao of pool.state.marcacoes.values()) {
    assert.equal(marcacao.status_exportacao, 'N');
  }

  const recuperada = await carregarPeriodo(sync);
  assert.equal(recuperada.success, true);
  assert.equal(recuperada.buscados, 2);
  assert.equal(recuperada.inseridos, 0);
  assert.equal(recuperada.atualizados, 2);
  assert.equal(recuperada.baixados, 2);
  assert.equal(recuperada.erros, 0);
  assert.equal(pool.state.marcacoes.size, 2, 'reprocessamento continua idempotente');
  for (const marcacao of pool.state.marcacoes.values()) {
    assert.equal(marcacao.status_exportacao, 'S');
  }
});

test('logs de sincronização têm contexto e contadores sem credenciais', async () => {
  const { sync } = setup();
  const linhas = [];
  const logOriginal = console.log;

  console.log = (...args) => linhas.push(args.join(' '));
  try {
    await carregarPeriodo(sync);
  } finally {
    console.log = logOriginal;
  }

  const texto = linhas.join('\n');
  assert.match(texto, /\[Exata\] pontos\.inicio empresa_config_id=1/);
  assert.match(texto, /\[Exata\] pontos\.empresa empresa_config_id=1 empresasistema=7/);
  assert.match(texto, /buscados=2/);
  assert.match(texto, /persistidos=2/);
  assert.match(texto, /baixados=2/);
  assert.match(texto, /erros=0/);
  assert.doesNotMatch(texto, /bearer|password|senha|token/i);
});
