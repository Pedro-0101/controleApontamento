/**
 * Sincronização do cadastro de funcionários e relógios (REPs) com a API
 * Ponto Certificado.
 *
 * Responsabilidades:
 *  - Carga inicial: cria no banco local os funcionários e relógios que ainda
 *    não existem.
 *  - Sincronização: atualiza nome/descrição e dados cadastrais sem apagar
 *    vínculos ou sobrescrever configurações locais (empresa/local/cargo e
 *    status ativo dos funcionários já existentes).
 *  - Registrar cada execução em `sincronizacao_execucao` para auditoria.
 */

const CHUNK_SIZE = 500;
const MARCACOES_CHUNK_SIZE = 500;
const MARCACOES_MAX_DIAS = 3660; // ~10 anos — evita intervalos inválidos gerarem milhares de chamadas
const RELOGIOS_DATA_INICIO = '01/01/2020';
const RELOGIOS_DATA_FIM = '31/12/2030';
const RELOGIOS_STATUS_TODOS = '4';

// Colunas persistidas de uma marcação. A ordem é usada nos INSERTs em lote.
const MARCACAO_COLUNAS = [
  'empresa_config_id',
  'empresa_id',
  'marcacao_id',
  'nsr',
  'data_marcacao',
  'data_insercao',
  'matricula',
  'cpf',
  'pis',
  'trabalhador_id',
  'num_serie_relogio',
  'tipo_registro',
  'id_local',
  'nome_local',
  'descricao_local',
  'codigo_unidade',
  'gps_latitude',
  'gps_longitude',
  'flag_fora_cerca',
  'atividade',
  'formulario',
  'resposta_formulario',
  'respostas_json',
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function buildDate(year, month, day, hours = 0, minutes = 0, seconds = 0) {
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes ||
    date.getSeconds() !== seconds
  ) {
    return null;
  }
  return date;
}

/**
 * Converte uma data recebida da API (dd/MM/yyyy HH:mm:ss ou /Date(...)/) em Date local.
 */
function parseApiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.startsWith('/Date(')) {
    const match = raw.match(/\/Date\((-?\d+)([+-]\d{4})?\)\//);
    if (!match) return null;
    const date = new Date(Number(match[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    return buildDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }

  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    return buildDate(
      Number(match[3]),
      Number(match[2]),
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Converte uma data/hora informada pelo usuário (ISO ou brasileira) em Date.
 * Quando o texto não traz horário, usa o início ou o fim do dia.
 */
function parseDateTimeInput(value, defaultTime = 'start') {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const hasTime = /\d{1,2}:\d{2}/.test(raw);
  const parsed = parseApiDate(raw);
  if (!parsed) return null;

  if (!hasTime) {
    if (defaultTime === 'end') parsed.setHours(23, 59, 59, 0);
    else parsed.setHours(0, 0, 0, 0);
  }

  return parsed;
}

function formatApiDateTime(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatMysqlDateTime(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Divide o período em blocos de um dia para evitar timeouts da API externa.
 * O primeiro e o último bloco preservam os horários informados pelo usuário.
 */
function splitPeriodo(dataInicio, dataFim) {
  const inicio = parseDateTimeInput(dataInicio, 'start');
  const fim = parseDateTimeInput(dataFim, 'end');

  if (!inicio || !fim) {
    throw new Error('Período inválido: informe datas no formato DD/MM/AAAA ou AAAA-MM-DD');
  }
  if (fim < inicio) {
    throw new Error('A data final deve ser maior ou igual à data inicial');
  }

  const inicioKey = formatDateKey(inicio);
  const fimKey = formatDateKey(fim);
  const blocos = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());

  while (formatDateKey(cursor) <= fimKey) {
    if (blocos.length >= MARCACOES_MAX_DIAS) {
      throw new Error(`Período muito longo: o máximo é de ${MARCACOES_MAX_DIAS} dias por execução`);
    }

    const key = formatDateKey(cursor);
    const blocoInicio = key === inicioKey
      ? new Date(inicio)
      : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0);
    const blocoFim = key === fimKey
      ? new Date(fim)
      : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59);

    blocos.push({ inicio: blocoInicio, fim: blocoFim });
    cursor.setDate(cursor.getDate() + 1);
  }

  return blocos;
}

function extractOperationArray(resposta, operation) {
  if (typeof resposta === 'string') {
    throw new Error(`API recusou ${operation}: ${resposta}`);
  }
  if (Array.isArray(resposta)) return resposta;
  if (resposta && Array.isArray(resposta.results)) return resposta.results;
  if (resposta === null || resposta === undefined || resposta === '') return [];
  throw new Error(`Resposta inválida de ${operation}`);
}

function normalizeMatricula(value) {
  return String(value ?? '').trim();
}

function normalizeNumSerie(value) {
  return String(value ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(/^0+/, '');
}

function normalizeTexto(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function apiAtivo(value) {
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function enrichStats(stats) {
  return {
    inseridos: 0,
    atualizados: 0,
    inalterados: 0,
    ignorados: 0,
    statusDivergentes: 0,
    semEmpresa: 0,
    ...stats,
  };
}

function createPontoSync({ pool, pontoApi }) {
  async function ensureSchema() {
    try {
      await pool.query('ALTER TABLE empresas_config ADD COLUMN empresa_id INT NULL');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME' && !error.message?.includes('Duplicate column name')) {
        throw error;
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sincronizacao_execucao (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        tipo                VARCHAR(50) NOT NULL,
        status              VARCHAR(20) NOT NULL,
        usuario             VARCHAR(100) NULL,
        iniciado_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
        finalizado_em       DATETIME NULL,
        duracao_ms          INT NULL,
        empresas_processadas INT NOT NULL DEFAULT 0,
        resumo              LONGTEXT NULL,
        erro                TEXT NULL,
        INDEX idx_iniciado_em (iniciado_em),
        INDEX idx_status (status)
      )
    `);

    // Marcações importadas da API externa. A chave única é (empresa da API + id
    // da marcação), pois o id sequencial é exclusivo por conta/empresa.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marcacoes_ponto (
        id                   INT AUTO_INCREMENT PRIMARY KEY,
        empresa_config_id    INT NOT NULL,
        empresa_id           INT NULL,
        marcacao_id          BIGINT NOT NULL,
        nsr                  INT NULL,
        data_marcacao        DATETIME NOT NULL,
        data_insercao        DATETIME NULL,
        matricula            VARCHAR(50) NOT NULL,
        cpf                  VARCHAR(20) NULL,
        pis                  VARCHAR(20) NULL,
        trabalhador_id       INT NULL,
        num_serie_relogio    VARCHAR(50) NOT NULL DEFAULT '',
        tipo_registro        INT NULL,
        id_local             INT NULL,
        nome_local           VARCHAR(255) NULL,
        descricao_local      VARCHAR(255) NULL,
        codigo_unidade       VARCHAR(50) NULL,
        gps_latitude         VARCHAR(50) NULL,
        gps_longitude        VARCHAR(50) NULL,
        flag_fora_cerca      TINYINT(1) NOT NULL DEFAULT 0,
        atividade            VARCHAR(255) NULL,
        formulario           TEXT NULL,
        resposta_formulario  LONGTEXT NULL,
        respostas_json       LONGTEXT NULL,
        importado_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_empresa_marcacao (empresa_config_id, marcacao_id),
        INDEX idx_data_marcacao (data_marcacao),
        INDEX idx_matricula (matricula),
        INDEX idx_relogio (num_serie_relogio),
        INDEX idx_nsr (nsr)
      )
    `);

    // Último id importado por empresa, base da sincronização incremental.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marcacao_sync_estado (
        empresa_config_id        INT PRIMARY KEY,
        ultimo_id                BIGINT NOT NULL DEFAULT 0,
        ultima_sincronizacao_em  DATETIME NULL,
        ultima_sincronizacao_tipo VARCHAR(20) NULL,
        ultimo_total_importado   INT NOT NULL DEFAULT 0
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

  async function loadEmpresasLocais() {
    const [rows] = await pool.query('SELECT id, nome FROM empresas ORDER BY id ASC');
    return rows;
  }

  /**
   * Resolve a empresa local usada para novos funcionários.
   * Ordem: vínculo explícito (empresas_config.empresa_id) → nome equivalente.
   * Quando o nome da conta da API representa mais de uma empresa local
   * (ex.: "DNP / Sao Joao"), não há vínculo automático.
   */
  function resolveEmpresaPadrao(company, empresas) {
    if (company.empresa_id) {
      const explicit = empresas.find((e) => Number(e.id) === Number(company.empresa_id));
      if (explicit) return explicit;
    }

    const alvo = normalizeTexto(company.nome);
    if (!alvo) return null;

    const exatos = empresas.filter((e) => normalizeTexto(e.nome) === alvo);
    if (exatos.length === 1) return exatos[0];

    const parciais = empresas.filter((e) => {
      const nome = normalizeTexto(e.nome);
      return nome.length >= 4 && (alvo.includes(nome) || nome.includes(alvo));
    });

    return parciais.length === 1 ? parciais[0] : null;
  }

  /**
   * Mapeia matrícula → empresa local para marcações. Uma conta da API pode
   * representar mais de uma empresa local (ex.: "DNP / Sao Joao"), então o
   * vínculo real do funcionário tem prioridade sobre a empresa padrão da conta.
   * Matrículas presentes em mais de uma empresa local permanecem ambíguas.
   */
  async function carregarEmpresasPorMatricula(matriculas) {
    const porMatricula = new Map();

    for (let i = 0; i < matriculas.length; i += CHUNK_SIZE) {
      const chunk = matriculas.slice(i, i + CHUNK_SIZE);
      if (chunk.length === 0) continue;

      const [rows] = await pool.query(
        `SELECT DISTINCT matricula, empresa_id, empresa
         FROM qrcod_2023
         WHERE empresa_id IS NOT NULL AND matricula IN (?)`,
        [chunk]
      );

      for (const row of rows) {
        const key = normalizeMatricula(row.matricula);
        if (!porMatricula.has(key)) porMatricula.set(key, []);
        porMatricula.get(key).push({ id: row.empresa_id, nome: row.empresa });
      }
    }

    const resolvidas = new Map();
    for (const [matricula, empresas] of porMatricula) {
      const ids = new Set(empresas.map((e) => Number(e.id)));
      if (ids.size === 1) resolvidas.set(matricula, empresas[0]);
    }
    return resolvidas;
  }

  async function carregarFuncionariosLocais(matriculas) {
    const porMatricula = new Map();

    for (let i = 0; i < matriculas.length; i += CHUNK_SIZE) {
      const chunk = matriculas.slice(i, i + CHUNK_SIZE);
      if (chunk.length === 0) continue;

      const [rows] = await pool.query(
        `SELECT id, matricula, nome, ativo, empresa_id, empresa
         FROM qrcod_2023
         WHERE matricula IN (?)`,
        [chunk]
      );

      for (const row of rows) {
        const key = normalizeMatricula(row.matricula);
        if (!porMatricula.has(key)) porMatricula.set(key, []);
        porMatricula.get(key).push(row);
      }
    }

    return porMatricula;
  }

  async function syncFuncionarios(company, { empresas, incluirNovos = true, atualizarStatus = false }) {
    const stats = enrichStats();
    const resposta = await pontoApi.callOperation(company, 'ListarFuncionarios', {});

    if (typeof resposta === 'string') {
      throw new Error(`API recusou a listagem de funcionários: ${resposta}`);
    }
    if (resposta !== null && resposta !== undefined && !Array.isArray(resposta)) {
      throw new Error('Resposta inválida de ListarFuncionarios');
    }

    const funcionariosApi = new Map();
    for (const item of resposta || []) {
      const matricula = normalizeMatricula(item?.Matricula);
      if (!matricula) {
        stats.ignorados++;
        continue;
      }
      if (funcionariosApi.has(matricula)) {
        stats.ignorados++;
        continue;
      }
      funcionariosApi.set(matricula, item);
    }

    if (funcionariosApi.size === 0) return stats;

    const empresaPadrao = resolveEmpresaPadrao(company, empresas);
    const matriculas = [...funcionariosApi.keys()];
    const locais = await carregarFuncionariosLocais(matriculas);

    for (const [matricula, item] of funcionariosApi) {
      const nomeApi = String(item?.Nome || '').trim();
      const ativoApi = apiAtivo(item?.Ativo);
      const existentes = locais.get(matricula);

      if (existentes && existentes.length > 0) {
        let alterou = false;
        let statusDivergente = false;

        for (const row of existentes) {
          const sets = [];
          const values = [];

          if (nomeApi && row.nome !== nomeApi) {
            sets.push('nome = ?');
            values.push(nomeApi);
            alterou = true;
          }

          if (Number(row.ativo) !== ativoApi) {
            statusDivergente = true;
            if (atualizarStatus) {
              sets.push('ativo = ?');
              values.push(ativoApi);
              alterou = true;
            }
          }

          // Funcionário já existente sem empresa: aproveita o vínculo recém
          // configurado, mas nunca troca a empresa de quem já está classificado.
          if (!row.empresa_id && empresaPadrao) {
            sets.push('empresa_id = ?', 'empresa = ?');
            values.push(empresaPadrao.id, empresaPadrao.nome);
            alterou = true;
          }

          if (sets.length > 0) {
            values.push(row.id);
            await pool.query(
              `UPDATE qrcod_2023 SET ${sets.join(', ')} WHERE id = ?`,
              values
            );
          }
        }

        if (statusDivergente) stats.statusDivergentes++;
        if (alterou) stats.atualizados++;
        else stats.inalterados++;
        continue;
      }

      if (!incluirNovos) {
        stats.ignorados++;
        continue;
      }

      if (!empresaPadrao) stats.semEmpresa++;

      await pool.query(
        `INSERT INTO qrcod_2023
           (matricula, empresa_id, empresa, nome, cargo, ativo, trabalha_sabado, bate_ponto, local)
         VALUES (?, ?, ?, ?, '', ?, 1, 1, '')`,
        [
          matricula,
          empresaPadrao ? empresaPadrao.id : null,
          empresaPadrao ? empresaPadrao.nome : '',
          nomeApi,
          ativoApi,
        ]
      );
      stats.inseridos++;
    }

    return stats;
  }

  async function syncRelogios(company) {
    const stats = enrichStats();
    const resposta = await pontoApi.callOperation(company, 'RetornaRelogiosInfo', {
      datainicio: RELOGIOS_DATA_INICIO,
      datafim: RELOGIOS_DATA_FIM,
      status: RELOGIOS_STATUS_TODOS,
    });

    if (typeof resposta === 'string') {
      throw new Error(`API recusou a listagem de relógios: ${resposta}`);
    }
    if (resposta !== null && resposta !== undefined && !Array.isArray(resposta)) {
      throw new Error('Resposta inválida de RetornaRelogiosInfo');
    }

    const relogiosApi = new Map();
    for (const item of resposta || []) {
      const numSerie = String(item?.NumSerieRelogio || '').trim();
      const key = normalizeNumSerie(numSerie);
      if (!key) {
        stats.ignorados++;
        continue;
      }
      if (relogiosApi.has(key)) {
        stats.ignorados++;
        continue;
      }
      relogiosApi.set(key, item);
    }

    if (relogiosApi.size === 0) return stats;

    const [locaisRows] = await pool.query(
      'SELECT id, num_serie, descricao, status, data_criacao FROM relogios'
    );
    const locais = new Map();
    for (const row of locaisRows) {
      locais.set(normalizeNumSerie(row.num_serie), row);
    }

    for (const [key, item] of relogiosApi) {
      const numSerie = String(item?.NumSerieRelogio || '').trim();
      const existente = locais.get(key);
      const descricaoApi = String(item?.Descricao || '').trim();
      const statusApi = Number(item?.Status);
      const dataCriacaoApi = item?.DataCriacao ? String(item.DataCriacao) : null;

      if (!existente) {
        await pool.query(
          `INSERT INTO relogios (num_serie, descricao, status, data_criacao, ativo)
           VALUES (?, ?, ?, ?, 1)`,
          [
            numSerie,
            descricaoApi,
            Number.isFinite(statusApi) ? statusApi : 1,
            dataCriacaoApi,
          ]
        );
        stats.inseridos++;
        continue;
      }

      const descricao = descricaoApi || existente.descricao || '';
      const status = Number.isFinite(statusApi) ? statusApi : (existente.status ?? 1);
      const dataCriacao = dataCriacaoApi || existente.data_criacao || null;

      const mudou =
        descricao !== existente.descricao ||
        Number(status) !== Number(existente.status) ||
        dataCriacao !== existente.data_criacao;

      if (mudou) {
        await pool.query(
          'UPDATE relogios SET descricao = ?, status = ?, data_criacao = ? WHERE id = ?',
          [descricao, status, dataCriacao, existente.id]
        );
        stats.atualizados++;
      } else {
        stats.inalterados++;
      }
    }

    return stats;
  }

  async function lerEstadoMarcacoes(companyId) {
    const [rows] = await pool.query(
      `SELECT empresa_config_id, ultimo_id, ultima_sincronizacao_em,
              ultima_sincronizacao_tipo, ultimo_total_importado
       FROM marcacao_sync_estado
       WHERE empresa_config_id = ?`,
      [companyId]
    );
    return rows[0] || {
      empresa_config_id: companyId,
      ultimo_id: 0,
      ultima_sincronizacao_em: null,
      ultima_sincronizacao_tipo: null,
      ultimo_total_importado: 0,
    };
  }

  async function salvarEstadoMarcacoes(companyId, { ultimoId, tipo, total }) {
    await pool.query(
      `INSERT INTO marcacao_sync_estado
         (empresa_config_id, ultimo_id, ultima_sincronizacao_em, ultima_sincronizacao_tipo, ultimo_total_importado)
       VALUES (?, ?, NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE
         ultimo_id = GREATEST(ultimo_id, VALUES(ultimo_id)),
         ultima_sincronizacao_em = NOW(),
         ultima_sincronizacao_tipo = VALUES(ultima_sincronizacao_tipo),
         ultimo_total_importado = VALUES(ultimo_total_importado)`,
      [companyId, Math.max(0, Number(ultimoId) || 0), tipo, Math.max(0, Number(total) || 0)]
    );
  }

  async function carregarMarcacoesExistentes(companyId, marcacaoIds) {
    const existentes = new Set();

    for (let i = 0; i < marcacaoIds.length; i += MARCACOES_CHUNK_SIZE) {
      const chunk = marcacaoIds.slice(i, i + MARCACOES_CHUNK_SIZE);
      if (chunk.length === 0) continue;

      const [rows] = await pool.query(
        `SELECT marcacao_id
         FROM marcacoes_ponto
         WHERE empresa_config_id = ? AND marcacao_id IN (?)`,
        [companyId, chunk]
      );
      for (const row of rows) existentes.add(Number(row.marcacao_id));
    }

    return existentes;
  }

  function normalizeMarcacaoApi(item, company, empresaPadrao) {
    const marcacaoId = Number(item?.id ?? item?.Id);
    if (!Number.isFinite(marcacaoId) || marcacaoId <= 0) return null;

    const dataMarcacao = parseApiDate(item?.DataMarcacao ?? item?.dataMarcacao);
    if (!dataMarcacao) return null;

    const matricula = normalizeMatricula(item?.MatriculaFuncionario ?? item?.matriculaFuncionario);
    if (!matricula) return null;

    const dataInsercao = parseApiDate(item?.DataInsercao ?? item?.dataInsercao);
    const respostas = item?.LstRespostas;
    let respostasJson = null;
    if (respostas !== null && respostas !== undefined) {
      try {
        respostasJson = typeof respostas === 'string' ? respostas : JSON.stringify(respostas);
      } catch {
        respostasJson = null;
      }
    }

    const numero = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const texto = (value) => {
      if (value === null || value === undefined) return null;
      const s = String(value);
      return s.length > 0 ? s : null;
    };

    return {
      empresa_config_id: company.id,
      empresa_id: empresaPadrao ? empresaPadrao.id : null,
      marcacao_id: marcacaoId,
      nsr: numero(item?.NSR ?? item?.nsr),
      data_marcacao: formatMysqlDateTime(dataMarcacao),
      data_insercao: dataInsercao ? formatMysqlDateTime(dataInsercao) : null,
      matricula,
      cpf: texto(item?.CPF ?? item?.cpf),
      pis: texto(item?.PIS ?? item?.pis),
      trabalhador_id: numero(item?.TrabalhadorId ?? item?.trabalhadorId),
      num_serie_relogio: String(item?.NumSerieRelogio ?? '').trim(),
      tipo_registro: numero(item?.TipoRegistro ?? item?.tipoRegistro),
      id_local: numero(item?.IdLocal ?? item?.idLocal),
      nome_local: texto(item?.NomeLocal ?? item?.nomeLocal),
      descricao_local: texto(item?.DescricaoLocal ?? item?.descricaoLocal),
      codigo_unidade: texto(item?.CodigoUnidade ?? item?.codigoUnidade),
      gps_latitude: texto(item?.GPSLatitude ?? item?.gpsLatitude),
      gps_longitude: texto(item?.GPSLongitude ?? item?.gpsLongitude),
      flag_fora_cerca: item?.FlagForaCerca === true || item?.FlagForaCerca === 1 || item?.FlagForaCerca === '1' ? 1 : 0,
      atividade: texto(item?.Atividade ?? item?.atividade),
      formulario: texto(item?.Formulario ?? item?.formulario),
      resposta_formulario: texto(item?.RespostaFormulario ?? item?.respostaFormulario),
      respostas_json: respostasJson,
    };
  }

  /**
   * Grava as marcações em lote. Retorna estatísticas da gravação.
   */
  async function persistirMarcacoes(company, empresaPadrao, itens) {
    const stats = {
      inseridos: 0,
      atualizados: 0,
      inalterados: 0,
      ignorados: 0,
      total: 0,
      ultimoId: 0,
    };

    const unicos = new Map();
    for (const item of itens || []) {
      const row = normalizeMarcacaoApi(item, company, empresaPadrao);
      if (!row) {
        stats.ignorados++;
        continue;
      }
      if (unicos.has(row.marcacao_id)) {
        stats.ignorados++;
        continue;
      }
      unicos.set(row.marcacao_id, row);
      if (row.marcacao_id > stats.ultimoId) stats.ultimoId = row.marcacao_id;
    }

    const rows = [...unicos.values()];
    if (rows.length === 0) return stats;

    // Empresa local por funcionário; usa a empresa padrão da conta quando a
    // matrícula não está cadastrada localmente ou está em mais de uma empresa.
    const empresasPorMatricula = await carregarEmpresasPorMatricula(
      rows.map((row) => row.matricula)
    );
    for (const row of rows) {
      const empresa = empresasPorMatricula.get(row.matricula);
      if (empresa) row.empresa_id = empresa.id;
    }

    const colunasAtualizaveis = MARCACAO_COLUNAS.filter(
      (coluna) => coluna !== 'empresa_config_id' && coluna !== 'marcacao_id'
    );
    const sql = `
      INSERT INTO marcacoes_ponto (${MARCACAO_COLUNAS.join(', ')})
      VALUES ?
      ON DUPLICATE KEY UPDATE
        ${colunasAtualizaveis.map((coluna) => `${coluna} = VALUES(${coluna})`).join(', ')}
    `;

    for (let i = 0; i < rows.length; i += MARCACOES_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + MARCACOES_CHUNK_SIZE);
      const ids = chunk.map((row) => row.marcacao_id);
      const existentes = await carregarMarcacoesExistentes(company.id, ids);

      const values = chunk.map((row) => MARCACAO_COLUNAS.map((coluna) => row[coluna] ?? null));
      await pool.query(sql, [values]);

      for (const row of chunk) {
        if (existentes.has(row.marcacao_id)) stats.atualizados++;
        else stats.inseridos++;
      }
    }

    stats.total = stats.inseridos + stats.atualizados;
    return stats;
  }

  /**
   * Carga histórica por período. Consulta a API dia a dia para evitar timeouts.
   */
  async function syncMarcacoesPeriodo(company, {
    empresas,
    dataInicio,
    dataFim,
    matriculaFuncionario = null,
    numSerieRelogio = null,
  }) {
    const empresaPadrao = resolveEmpresaPadrao(company, empresas);
    const blocos = splitPeriodo(dataInicio, dataFim);
    const stats = {
      inseridos: 0,
      atualizados: 0,
      inalterados: 0,
      ignorados: 0,
      total: 0,
      ultimoId: 0,
      periodos: blocos.length,
      dataInicio: formatApiDateTime(blocos[0].inicio),
      dataFim: formatApiDateTime(blocos[blocos.length - 1].fim),
    };

    for (const bloco of blocos) {
      const resposta = await pontoApi.callOperation(company, 'SelecionaMarcacoes', {
        numSerieRelogio: numSerieRelogio || '',
        matriculaFuncionario: matriculaFuncionario || '',
        dataInicio: formatApiDateTime(bloco.inicio),
        dataFim: formatApiDateTime(bloco.fim),
      });

      const itens = extractOperationArray(resposta, 'SelecionaMarcacoes');
      const parcial = await persistirMarcacoes(company, empresaPadrao, itens);

      stats.inseridos += parcial.inseridos;
      stats.atualizados += parcial.atualizados;
      stats.inalterados += parcial.inalterados;
      stats.ignorados += parcial.ignorados;
      if (parcial.ultimoId > stats.ultimoId) stats.ultimoId = parcial.ultimoId;
    }

    stats.total = stats.inseridos + stats.atualizados;

    // O último id só avança (nunca retrocede), preservando o progresso de uma
    // carga incremental já realizada.
    const estado = await lerEstadoMarcacoes(company.id);
    const ultimoIdPersistido = Math.max(Number(estado.ultimo_id) || 0, stats.ultimoId);
    await salvarEstadoMarcacoes(company.id, {
      ultimoId: ultimoIdPersistido,
      tipo: 'PERIODO',
      total: stats.total,
    });
    stats.ultimoId = ultimoIdPersistido;

    return stats;
  }

  /**
   * Sincronização incremental usando o último id importado da empresa.
   */
  async function syncMarcacoesIncremental(company, { empresas }) {
    const empresaPadrao = resolveEmpresaPadrao(company, empresas);
    const estado = await lerEstadoMarcacoes(company.id);
    const ultimoIdAnterior = Math.max(0, Number(estado.ultimo_id) || 0);

    const resposta = await pontoApi.callOperation(company, 'SelecionaMarcacoesPosteriorIdInformado', {
      ultIdImportado: ultimoIdAnterior,
    });

    const itens = extractOperationArray(resposta, 'SelecionaMarcacoesPosteriorIdInformado');
    const stats = await persistirMarcacoes(company, empresaPadrao, itens);

    const ultimoId = Math.max(ultimoIdAnterior, stats.ultimoId);
    await salvarEstadoMarcacoes(company.id, {
      ultimoId,
      tipo: 'INCREMENTAL',
      total: stats.total,
    });

    return {
      ...stats,
      ultimoId,
      ultimoIdAnterior,
    };
  }

  /**
   * Executa a importação de marcações.
   * @param {object} options
   * @param {number[]} [options.companyIds] limita às empresas de API informadas
   * @param {('periodo'|'incremental')} [options.modo='incremental']
   * @param {string} [options.dataInicio] obrigatório no modo período
   * @param {string} [options.dataFim] obrigatório no modo período
   * @param {string} [options.matriculaFuncionario] filtro opcional no modo período
   * @param {string} [options.numSerieRelogio] filtro opcional no modo período
   * @param {string} [options.usuario]
   */
  async function runMarcacoesSync({
    companyIds,
    modo = 'incremental',
    dataInicio,
    dataFim,
    matriculaFuncionario = null,
    numSerieRelogio = null,
    usuario = null,
  } = {}) {
    await ensureSchema();

    const modoNormalizado = modo === 'periodo'
      ? 'periodo'
      : (modo === 'incremental' ? 'incremental' : null);

    if (!modoNormalizado) {
      throw new Error("Modo inválido: use 'periodo' ou 'incremental'");
    }
    if (modoNormalizado === 'periodo') {
      if (!dataInicio || !dataFim) {
        throw new Error('Informe dataInicio e dataFim para importar por período');
      }
      // Valida o intervalo uma única vez antes de iniciar as empresas.
      splitPeriodo(dataInicio, dataFim);
    }

    const companies = await loadCompanies(companyIds);
    if (companies.length === 0) {
      throw new Error('Nenhuma empresa de API ativa encontrada para sincronizar marcações');
    }

    const empresas = await loadEmpresasLocais();
    const iniciadoEm = Date.now();
    const resultados = [];
    let totalComErro = 0;

    for (const company of companies) {
      const resultado = {
        empresa_config_id: company.id,
        nome: company.nome,
        empresa_padrao: resolveEmpresaPadrao(company, empresas)?.nome || null,
        modo: modoNormalizado,
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
        periodos: null,
        marcacoes: null,
        ultimo_id: null,
        ultimo_id_anterior: null,
        erro: null,
      };

      try {
        if (modoNormalizado === 'periodo') {
          const stats = await syncMarcacoesPeriodo(company, {
            empresas,
            dataInicio,
            dataFim,
            matriculaFuncionario,
            numSerieRelogio,
          });
          resultado.periodos = stats.periodos;
          resultado.dataInicio = stats.dataInicio;
          resultado.dataFim = stats.dataFim;
          resultado.ultimo_id = stats.ultimoId;
          resultado.marcacoes = {
            inseridos: stats.inseridos,
            atualizados: stats.atualizados,
            inalterados: stats.inalterados,
            ignorados: stats.ignorados,
            total: stats.total,
            ultimoId: stats.ultimoId,
          };
        } else {
          const stats = await syncMarcacoesIncremental(company, { empresas });
          resultado.ultimo_id = stats.ultimoId;
          resultado.ultimo_id_anterior = stats.ultimoIdAnterior;
          resultado.marcacoes = {
            inseridos: stats.inseridos,
            atualizados: stats.atualizados,
            inalterados: stats.inalterados,
            ignorados: stats.ignorados,
            total: stats.total,
            ultimoId: stats.ultimoId,
          };
        }
      } catch (error) {
        totalComErro++;
        resultado.erro = error?.message || String(error);
        console.error(`[Marcações] Empresa ${company.nome}:`, resultado.erro);
      }

      resultados.push(resultado);
    }

    const status = totalComErro === 0
      ? 'CONCLUIDO'
      : (totalComErro === companies.length ? 'ERRO' : 'PARCIAL');

    const resumo = {
      modo: modoNormalizado,
      dataInicio: dataInicio || null,
      dataFim: dataFim || null,
      matriculaFuncionario: matriculaFuncionario || null,
      numSerieRelogio: numSerieRelogio || null,
      empresas: resultados,
    };

    const duracaoMs = Date.now() - iniciadoEm;
    const execucaoId = await registrarExecucao({
      tipo: modoNormalizado === 'periodo' ? 'MARCACOES_PERIODO' : 'MARCACOES_INCREMENTAL',
      status,
      usuario,
      iniciadoEm,
      duracaoMs,
      empresasProcessadas: resultados.length,
      resumo,
      erro: totalComErro > 0
        ? resultados.filter((r) => r.erro).map((r) => `${r.nome}: ${r.erro}`).join('; ')
        : null,
    });

    return {
      success: totalComErro === 0,
      execucaoId,
      status,
      modo: modoNormalizado,
      duracaoMs,
      empresas: resultados,
    };
  }

  async function getMarcacoesStatus() {
    await ensureSchema();
    const [rows] = await pool.query(
      `SELECT ec.id AS empresa_config_id,
              ec.nome,
              ec.ativo,
              COALESCE(ms.ultimo_id, 0) AS ultimo_id,
              ms.ultima_sincronizacao_em,
              ms.ultima_sincronizacao_tipo,
              COALESCE(ms.ultimo_total_importado, 0) AS ultimo_total_importado
       FROM empresas_config ec
       LEFT JOIN marcacao_sync_estado ms ON ms.empresa_config_id = ec.id
       WHERE ec.provedor <> 'exata'
       ORDER BY ec.nome ASC`
    );
    return rows;
  }

  async function registrarExecucao({ tipo, status, usuario, iniciadoEm, duracaoMs, empresasProcessadas, resumo, erro }) {
    const [result] = await pool.query(
      `INSERT INTO sincronizacao_execucao
         (tipo, status, usuario, finalizado_em, duracao_ms, empresas_processadas, resumo, erro)
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        tipo,
        status,
        usuario || null,
        duracaoMs,
        empresasProcessadas,
        resumo ? JSON.stringify(resumo) : null,
        erro || null,
      ]
    );
    return result.insertId;
  }

  /**
   * Executa a sincronização.
   * @param {object} options
   * @param {number[]} [options.companyIds] limita às empresas de API informadas
   * @param {('funcionarios'|'relogios')[]} [options.recursos]
   * @param {boolean} [options.incluirNovos=true]
   * @param {boolean} [options.atualizarStatus=false]
   * @param {string} [options.usuario]
   */
  async function runSync({
    companyIds,
    recursos,
    incluirNovos = true,
    atualizarStatus = false,
    usuario = null,
  } = {}) {
    await ensureSchema();

    const selecionados = Array.isArray(recursos) && recursos.length > 0
      ? recursos.filter((r) => r === 'funcionarios' || r === 'relogios')
      : ['funcionarios', 'relogios'];

    if (selecionados.length === 0) {
      throw new Error('Nenhum recurso válido informado (use funcionarios e/ou relogios)');
    }

    const companies = await loadCompanies(companyIds);
    if (companies.length === 0) {
      throw new Error('Nenhuma empresa de API ativa encontrada para sincronizar');
    }

    const empresas = await loadEmpresasLocais();
    const iniciadoEm = Date.now();
    const resultados = [];
    let totalComErro = 0;

    for (const company of companies) {
      const resultado = {
        empresa_config_id: company.id,
        nome: company.nome,
        empresa_padrao: resolveEmpresaPadrao(company, empresas)?.nome || null,
        funcionarios: null,
        relogios: null,
        erro: null,
      };

      try {
        if (selecionados.includes('funcionarios')) {
          resultado.funcionarios = await syncFuncionarios(company, {
            empresas,
            incluirNovos,
            atualizarStatus,
          });
        }

        if (selecionados.includes('relogios')) {
          resultado.relogios = await syncRelogios(company);
        }
      } catch (error) {
        totalComErro++;
        resultado.erro = error?.message || String(error);
        console.error(`[Sincronização] Empresa ${company.nome}:`, resultado.erro);
      }

      resultados.push(resultado);
    }

    const status = totalComErro === 0
      ? 'CONCLUIDO'
      : (totalComErro === companies.length ? 'ERRO' : 'PARCIAL');

    const resumo = {
      recursos: selecionados,
      incluirNovos,
      atualizarStatus,
      empresas: resultados,
    };

    const duracaoMs = Date.now() - iniciadoEm;
    const execucaoId = await registrarExecucao({
      tipo: 'TUDO',
      status,
      usuario,
      iniciadoEm,
      duracaoMs,
      empresasProcessadas: resultados.length,
      resumo,
      erro: totalComErro > 0 ? resultados.filter((r) => r.erro).map((r) => `${r.nome}: ${r.erro}`).join('; ') : null,
    });

    return {
      success: totalComErro === 0,
      execucaoId,
      status,
      duracaoMs,
      empresas: resultados,
    };
  }

  async function getHistorico({ limit = 20 } = {}) {
    await ensureSchema();
    const limite = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const [rows] = await pool.query(
      `SELECT id, tipo, status, usuario, iniciado_em, finalizado_em, duracao_ms,
              empresas_processadas, resumo, erro
       FROM sincronizacao_execucao
       ORDER BY id DESC
       LIMIT ?`,
      [limite]
    );

    return rows.map((row) => {
      let resumo = row.resumo;
      if (typeof resumo === 'string') {
        try { resumo = JSON.parse(resumo); } catch { /* mantém string */ }
      }
      return { ...row, resumo };
    });
  }

  return {
    ensureSchema,
    runSync,
    runMarcacoesSync,
    getHistorico,
    getMarcacoesStatus,
    // expostos para testes/uso pontual
    resolveEmpresaPadrao,
    normalizeMatricula,
    normalizeNumSerie,
  };
}

module.exports = {
  createPontoSync,
  normalizeMatricula,
  normalizeNumSerie,
  normalizeTexto,
  parseApiDate,
  splitPeriodo,
};
