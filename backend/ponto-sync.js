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
const RELOGIOS_DATA_INICIO = '01/01/2020';
const RELOGIOS_DATA_FIM = '31/12/2030';
const RELOGIOS_STATUS_TODOS = '4';

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
  }

  async function loadCompanies(companyIds) {
    const ids = Array.isArray(companyIds)
      ? companyIds.map(Number).filter(Number.isFinite)
      : [];

    if (ids.length > 0) {
      const [rows] = await pool.query(
        `SELECT id, nome, email, senha, chave, ativo, empresa_id
         FROM empresas_config
         WHERE ativo = 1 AND id IN (?)
         ORDER BY nome ASC`,
        [ids]
      );
      return rows;
    }

    const [rows] = await pool.query(
      `SELECT id, nome, email, senha, chave, ativo, empresa_id
       FROM empresas_config
       WHERE ativo = 1
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
    getHistorico,
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
};
