'use strict';

/**
 * Fase 5 — AFD (Arquivo Fonte de Dados — Portaria 671/MTP).
 *
 * Responsabilidades:
 *  - Gerar AFD por empresa da API usando o token centralizado
 *    (`pontoApi.callOperation`), com suporte às cinco operações de AFD.
 *  - Guardar o conteúdo gerado em `afd_geracao` para permitir novo download
 *    sem precisar consultar a API externa novamente.
 *  - Validar período, relógio e empresa antes de chamar a API.
 *
 * A API externa responde as operações de AFD com `{ "d": "<conteudo>" }`.
 * O conteúdo é texto puro (linhas terminadas em CRLF) e deve ser entregue
 * como arquivo `.txt`.
 */

const AFD_OPERACOES = {
  GeraAFD: {
    label: 'AFD por relógio',
    api: 'GeraAFD',
    exigeRelogio: true,
    camposData: ['dataInicial', 'dataFinal'],
    descricao: 'Arquivo AFD de um relógio específico no período informado.',
  },
  GeraAFDUnico: {
    label: 'AFD único (todos os relógios)',
    api: 'GeraAFDUnico',
    exigeRelogio: false,
    camposData: ['dataInicial', 'dataFinal'],
    descricao: 'Arquivo AFD consolidado de todos os relógios da empresa.',
  },
  GeraAFDmodeloREPP: {
    label: 'AFD modelo REPP',
    api: 'GeraAFDmodeloREPP',
    exigeRelogio: false,
    camposData: ['dataInicial', 'dataFinal'],
    descricao: 'Arquivo AFD no modelo REPP (registrador eletrônico de ponto).',
  },
  GeraAFDmodeloREPA: {
    label: 'AFD modelo REPA',
    api: 'GeraAFDmodeloREPA',
    exigeRelogio: false,
    camposData: ['inicioBusca', 'fimBusca'],
    descricao: 'Arquivo AFD no modelo REPA (registrador de ponto alternativo).',
  },
  GeraAFDDataRecepcao: {
    label: 'AFD por data de recepção',
    api: 'GeraAFDDataRecepcao',
    exigeRelogio: true,
    camposData: ['dataInicial', 'dataFinal'],
    descricao: 'Arquivo AFD filtrado pela data de recepção das marcações.',
  },
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function normalizeTexto(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Aceita AAAA-MM-DD ou DD/MM/AAAA e devolve DD/MM/AAAA (formato da API).
 */
function normalizeApiDate(value, fieldName) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new Error(`Informe ${fieldName}`);
  }

  let ano;
  let mes;
  let dia;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    [, ano, mes, dia] = match;
  } else {
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      [, dia, mes, ano] = match;
    }
  }

  if (!match) {
    throw new Error(`${fieldName} inválida: use AAAA-MM-DD ou DD/MM/AAAA`);
  }

  const date = new Date(Number(ano), Number(mes) - 1, Number(dia));
  if (
    date.getFullYear() !== Number(ano) ||
    date.getMonth() !== Number(mes) - 1 ||
    date.getDate() !== Number(dia)
  ) {
    throw new Error(`${fieldName} inválida`);
  }

  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function normalizeNumSerie(value) {
  return String(value ?? '').trim().replace(/\./g, '').replace(/^0+/, '');
}

function safeFileNamePart(value) {
  return normalizeTexto(value).slice(0, 60) || 'empresa';
}

function createPontoAfd({ pool, pontoApi }) {
  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS afd_geracao (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        empresa_config_id   INT NOT NULL,
        empresa_config_nome VARCHAR(255) NOT NULL,
        operacao            VARCHAR(40) NOT NULL,
        operacao_api        VARCHAR(40) NOT NULL,
        numero_serie        VARCHAR(50) NULL,
        data_inicial        VARCHAR(10) NULL,
        data_final          VARCHAR(10) NULL,
        nome_arquivo        VARCHAR(255) NOT NULL,
        tamanho_bytes       INT NOT NULL DEFAULT 0,
        conteudo            LONGTEXT NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'CONCLUIDO',
        erro                TEXT NULL,
        usuario             VARCHAR(100) NULL,
        criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_afd_criado_em (criado_em),
        INDEX idx_afd_empresa (empresa_config_id)
      )
    `);
  }

  async function loadCompanies(companyIds) {
    const ids = Array.isArray(companyIds)
      ? companyIds.map(Number).filter(Number.isFinite)
      : [];

    if (ids.length > 0) {
      const [rows] = await pool.query(
        `SELECT id, nome, email, senha, chave, ativo, empresa_id
         FROM empresas_config
         WHERE ativo = 1 AND provedor <> 'exata' AND id IN (?)
         ORDER BY nome ASC`,
        [ids]
      );
      return rows;
    }

    const [rows] = await pool.query(
      `SELECT id, nome, email, senha, chave, ativo, empresa_id
       FROM empresas_config
       WHERE ativo = 1 AND provedor <> 'exata'
       ORDER BY nome ASC`
    );
    return rows;
  }

  function resolverOperacao(operacao) {
    const chave = String(operacao ?? '').trim();
    if (!chave) throw new Error('Informe a operação de AFD');
    if (AFD_OPERACOES[chave]) return { chave, ...AFD_OPERACOES[chave] };

    const porLabel = Object.entries(AFD_OPERACOES).find(
      ([, cfg]) => normalizeTexto(cfg.label) === normalizeTexto(chave)
    );
    if (porLabel) return { chave: porLabel[0], ...porLabel[1] };

    throw new Error(`Operação de AFD inválida: ${chave}`);
  }

  function montarBody(operacao, { dataInicial, dataFim, numeroSerie, numeroRelogioCabecalho }) {
    const body = {};

    if (operacao.chave === 'GeraAFDmodeloREPA') {
      body.inicioBusca = normalizeApiDate(dataInicial, 'data inicial');
      body.fimBusca = normalizeApiDate(dataFim, 'data final');
    } else {
      body.dataInicial = normalizeApiDate(dataInicial, 'data inicial');
      body.dataFinal = normalizeApiDate(dataFim, 'data final');
    }

    if (operacao.exigeRelogio) {
      const serie = String(numeroSerie ?? '').trim();
      if (!serie) {
        throw new Error('Informe o número de série do relógio para esta operação');
      }
      body.numeroSerie = serie;
    }

    if (operacao.chave === 'GeraAFDUnico') {
      const cabecalho = String(numeroRelogioCabecalho ?? '').trim();
      if (cabecalho) body.numeroRelogioCabecalho = cabecalho;
    }

    return body;
  }

  function nomeArquivo(company, operacao, body, dataInicial, dataFim) {
    const periodo = `${String(dataInicial).replace(/[^0-9]/g, '')}-${String(dataFim).replace(/[^0-9]/g, '')}`;
    const serie = body.numeroSerie ? `-${normalizeNumSerie(body.numeroSerie)}` : '';
    return `AFD-${operacao.chave}${serie}-${safeFileNamePart(company.nome)}-${periodo}.txt`;
  }

  async function registrarGeracao({
    company,
    operacao,
    body,
    dataInicial,
    dataFim,
    conteudo,
    status,
    erro,
    usuario,
  }) {
    const nome = nomeArquivo(company, operacao, body, dataInicial, dataFim);
    const tamanho = conteudo ? Buffer.byteLength(conteudo, 'utf8') : 0;

    const [result] = await pool.query(
      `INSERT INTO afd_geracao
         (empresa_config_id, empresa_config_nome, operacao, operacao_api,
          numero_serie, data_inicial, data_final, nome_arquivo, tamanho_bytes,
          conteudo, status, erro, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company.id,
        company.nome,
        operacao.chave,
        operacao.api,
        body.numeroSerie || null,
        dataInicial || null,
        dataFim || null,
        nome,
        tamanho,
        conteudo || null,
        status,
        erro || null,
        usuario || null,
      ]
    );

    return {
      id: result.insertId,
      empresa_config_id: company.id,
      empresa_config_nome: company.nome,
      operacao: operacao.chave,
      operacao_api: operacao.api,
      numero_serie: body.numeroSerie || null,
      data_inicial: dataInicial || null,
      data_final: dataFim || null,
      nome_arquivo: nome,
      tamanho_bytes: tamanho,
      status,
      erro: erro || null,
      criado_em: new Date().toISOString(),
    };
  }

  /**
   * Gera o AFD para uma ou mais empresas da API.
   * Cada empresa é processada de forma independente: uma falha não impede as
   * demais. O retorno nunca inclui o conteúdo completo do arquivo, apenas os
   * metadados e o id para download posterior.
   */
  async function gerarAfd({
    empresaConfigIds,
    operacao,
    dataInicial,
    dataFim,
    numeroSerie,
    numeroRelogioCabecalho,
    usuario = null,
  } = {}) {
    await ensureSchema();

    const op = resolverOperacao(operacao);
    const body = montarBody(op, { dataInicial, dataFim, numeroSerie, numeroRelogioCabecalho });
    const companies = await loadCompanies(empresaConfigIds);

    if (companies.length === 0) {
      throw new Error('Nenhuma empresa de API ativa encontrada');
    }

    const resultados = [];
    let totalSucesso = 0;

    for (const company of companies) {
      try {
        const resposta = await pontoApi.callOperation(company, op.api, body);

        if (typeof resposta !== 'string' || resposta.trim() === '') {
          const mensagem = typeof resposta === 'string' ? resposta : 'Resposta inválida da API (AFD vazio)';
          throw new Error(mensagem);
        }

        const registro = await registrarGeracao({
          company,
          operacao: op,
          body,
          dataInicial,
          dataFim,
          conteudo: resposta,
          status: 'CONCLUIDO',
          usuario,
        });

        resultados.push({ ...registro, sucesso: true });
        totalSucesso++;
      } catch (error) {
        const mensagem = error?.message || String(error);
        const registro = await registrarGeracao({
          company,
          operacao: op,
          body,
          dataInicial,
          dataFim,
          conteudo: null,
          status: 'ERRO',
          erro: mensagem,
          usuario,
        }).catch(() => null);

        resultados.push({
          ...(registro || {
            empresa_config_id: company.id,
            empresa_config_nome: company.nome,
            operacao: op.chave,
            nome_arquivo: null,
            tamanho_bytes: 0,
            status: 'ERRO',
          }),
          sucesso: false,
          erro: mensagem,
        });
      }
    }

    return {
      success: totalSucesso === companies.length,
      operacao: op.chave,
      operacaoLabel: op.label,
      empresas: resultados,
      total: resultados.length,
      sucesso: totalSucesso,
      erros: resultados.length - totalSucesso,
    };
  }

  async function listarGeracoes({ limit = 50 } = {}) {
    await ensureSchema();
    const limite = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const [rows] = await pool.query(
      `SELECT id, empresa_config_id, empresa_config_nome, operacao, operacao_api,
              numero_serie, data_inicial, data_final, nome_arquivo, tamanho_bytes,
              status, erro, usuario, criado_em
       FROM afd_geracao
       ORDER BY id DESC
       LIMIT ?`,
      [limite]
    );

    return rows;
  }

  async function obterArquivo(id) {
    await ensureSchema();
    const [rows] = await pool.query(
      `SELECT id, empresa_config_nome, operacao, nome_arquivo, conteudo, status, criado_em
       FROM afd_geracao
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) return null;
    const row = rows[0];
    if (row.status !== 'CONCLUIDO' || !row.conteudo) {
      throw new Error('O arquivo AFD desta geração não está disponível');
    }
    return row;
  }

  function listarOperacoes() {
    return Object.entries(AFD_OPERACOES).map(([chave, cfg]) => ({
      chave,
      label: cfg.label,
      api: cfg.api,
      exigeRelogio: cfg.exigeRelogio,
      descricao: cfg.descricao,
    }));
  }

  return {
    ensureSchema,
    gerarAfd,
    listarGeracoes,
    obterArquivo,
    listarOperacoes,
  };
}

module.exports = {
  createPontoAfd,
  AFD_OPERACOES,
  normalizeApiDate,
};
