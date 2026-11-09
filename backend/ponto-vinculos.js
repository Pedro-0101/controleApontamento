/**
 * Fase 4 — Vínculos funcionário-relógio com a API Ponto Certificado.
 *
 * Responsabilidades:
 *  - Prévia de vinculação/desvinculação antes de alterar dados.
 *  - Vinculação e desvinculação individual e em lote (produto cartesiano
 *    matrículas × relógios), usando o token centralizado por empresa.
 *  - Sincronização dos vínculos existentes na API para a tabela local
 *    `relogio_funcionario`.
 *  - Registro das operações em `sincronizacao_execucao` para auditoria.
 *
 * A API externa expõe duas operações complementares:
 *  - `vinculaFuncionarioRelogio`: um item por par (matrícula, relógio).
 *  - `VinculaFuncionarioRelogioPorLista`: produto cartesiano de listas.
 * A operação individual é usada primeiro e a operação por lista serve como
 * fallback (agrupada por matrícula para não afetar pares fora do lote).
 */

const CHUNK_SIZE = 500;
const API_BATCH_SIZE = 50;
const SYNC_CONCURRENCY = 10;
const MAX_PARES = 20000;
const PREVIEW_LIMIT = 500;

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

function toArrayUnique(values, normalizer) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizer(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function chunk(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

function apiAtivo(value) {
  return value === true || value === 1 || value === '1';
}

function chavePar(matricula, numSerie) {
  return `${normalizeMatricula(matricula)}\u0000${normalizeNumSerie(numSerie)}`;
}

async function mapWithConcurrency(items, limit, worker) {
  const resultados = new Array(items.length);
  const tamanho = Math.max(1, limit);

  for (let inicio = 0; inicio < items.length; inicio += tamanho) {
    const lote = items.slice(inicio, inicio + tamanho);
    await Promise.all(lote.map(async (item, offset) => {
      resultados[inicio + offset] = await worker(item, inicio + offset);
    }));
  }

  return resultados;
}

function createPontoVinculos({ pool, pontoApi }) {
  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS relogio_funcionario (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        relogio_id    INT NOT NULL,
        matricula     VARCHAR(50) NOT NULL,
        status        INT DEFAULT 1,
        criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_relogio_matricula (relogio_id, matricula),
        INDEX idx_matricula (matricula),
        INDEX idx_relogio_id (relogio_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vinculo_sync_estado (
        empresa_config_id         INT PRIMARY KEY,
        ultima_sincronizacao_em   DATETIME NULL,
        ultima_sincronizacao_tipo VARCHAR(20) NULL,
        ultimo_total_vinculado    INT NOT NULL DEFAULT 0,
        ultimo_total_desvinculado INT NOT NULL DEFAULT 0
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

  function resolveCompanyForEmployee(funcionario, companies) {
    if (funcionario?.empresa_id) {
      const porEmpresa = companies.filter(
        (company) => Number(company.empresa_id) === Number(funcionario.empresa_id)
      );
      if (porEmpresa.length > 0) return porEmpresa[0];

      // O funcionário pertence a uma empresa local diferente das contas
      // selecionadas. Não use outra conta como fallback, pois a API rejeitaria
      // a matrícula e vincularia o par ao token errado.
      const comMapeamento = companies.filter((company) => company.empresa_id != null);
      if (comMapeamento.length > 0) return null;
      if (companies.length === 1) return companies[0];
      return null;
    }

    if (companies.length === 1) return companies[0];

    const nome = normalizeTexto(funcionario?.empresa);
    if (nome) {
      const porNome = companies.filter(
        (company) => normalizeTexto(company.nome) === nome
      );
      if (porNome.length === 1) return porNome[0];
    }

    return null;
  }

  async function carregarFuncionarios(matriculas) {
    const encontrados = new Map();
    for (const lote of chunk(matriculas, CHUNK_SIZE)) {
      const [rows] = await pool.query(
        `SELECT id, matricula, nome, ativo, empresa_id, empresa
         FROM qrcod_2023
         WHERE matricula IN (?)`,
        [lote]
      );
      for (const row of rows) {
        encontrados.set(normalizeMatricula(row.matricula), row);
      }
    }
    return encontrados;
  }

  async function carregarRelogios() {
    const [rows] = await pool.query(
      'SELECT id, num_serie, descricao, ativo FROM relogios ORDER BY descricao ASC, num_serie ASC'
    );
    const porNumSerie = new Map();
    for (const row of rows) {
      porNumSerie.set(normalizeNumSerie(row.num_serie), row);
    }
    return { rows, porNumSerie };
  }

  async function carregarVinculosLocais(matriculas) {
    const porPar = new Map();
    for (const lote of chunk(matriculas, CHUNK_SIZE)) {
      const [rows] = await pool.query(
        `SELECT rf.matricula, rf.status, r.num_serie
         FROM relogio_funcionario rf
         INNER JOIN relogios r ON r.id = rf.relogio_id
         WHERE rf.matricula IN (?)`,
        [lote]
      );
      for (const row of rows) {
        porPar.set(
          chavePar(row.matricula, row.num_serie),
          Number(row.status)
        );
      }
    }
    return porPar;
  }

  /**
   * Monta o plano de alterações (pares que realmente mudam de estado).
   */
  async function montarPlano({ matriculas, numSeries, acao, companyIds }) {
    const matriculasNormalizadas = toArrayUnique(matriculas, normalizeMatricula);
    const numSeriesNormalizados = toArrayUnique(numSeries, normalizeNumSerie);

    if (matriculasNormalizadas.length === 0) {
      throw new Error('Informe ao menos uma matrícula');
    }
    if (numSeriesNormalizados.length === 0) {
      throw new Error('Informe ao menos um relógio');
    }
    if (acao !== 'vincular' && acao !== 'desvincular') {
      throw new Error("Ação inválida: use 'vincular' ou 'desvincular'");
    }
    if (matriculasNormalizadas.length * numSeriesNormalizados.length > MAX_PARES) {
      throw new Error(`Operação muito grande: o máximo é de ${MAX_PARES} pares por execução`);
    }

    const companies = await loadCompanies(companyIds);
    if (companies.length === 0) {
      throw new Error('Nenhuma empresa de API ativa encontrada');
    }

    const funcionarios = await carregarFuncionarios(matriculasNormalizadas);
    const { porNumSerie: relogiosPorNumSerie } = await carregarRelogios();

    const matriculasEncontradas = [];
    const naoEncontradas = [];
    for (const matricula of matriculasNormalizadas) {
      if (funcionarios.has(matricula)) matriculasEncontradas.push(matricula);
      else naoEncontradas.push(matricula);
    }

    const relogiosEncontrados = [];
    const relogiosDesconhecidos = [];
    for (const numSerie of numSeriesNormalizados) {
      const relogio = relogiosPorNumSerie.get(numSerie);
      if (relogio) relogiosEncontrados.push({ ...relogio, num_serie_normalizado: numSerie });
      else relogiosDesconhecidos.push(numSerie);
    }

    const vinculosLocais = await carregarVinculosLocais(matriculasEncontradas);

    const alteracoes = [];
    const semEmpresa = [];
    let jaAplicados = 0;
    let totalPares = 0;

    for (const matricula of matriculasEncontradas) {
      const funcionario = funcionarios.get(matricula);
      const company = resolveCompanyForEmployee(funcionario, companies);

      if (!company) {
        semEmpresa.push({ matricula, nome: funcionario.nome || '' });
        continue;
      }

      for (const relogio of relogiosEncontrados) {
        totalPares++;

        const statusAtual = vinculosLocais.get(chavePar(matricula, relogio.num_serie));
        const ativoAtualmente = Number(statusAtual) === 1;
        const deveAlterar = acao === 'vincular' ? !ativoAtualmente : ativoAtualmente;

        if (!deveAlterar) {
          jaAplicados++;
          continue;
        }

        alteracoes.push({
          matricula,
          nome: funcionario.nome || '',
          empresa_config_id: company.id,
          empresa_config_nome: company.nome,
          relogio_id: relogio.id,
          num_serie: relogio.num_serie,
          descricao: relogio.descricao || '',
          acao,
        });
      }
    }

    return {
      acao,
      companies,
      funcionarios,
      relogios: relogiosEncontrados,
      alteracoes,
      resumo: {
        funcionarios: matriculasEncontradas.length,
        relogios: relogiosEncontrados.length,
        combinacoes: totalPares,
        alteracoes: alteracoes.length,
        jaAplicados,
        semEmpresa: semEmpresa.length,
        matriculasNaoEncontradas: naoEncontradas.length,
        relogiosDesconhecidos: relogiosDesconhecidos.length,
      },
      naoEncontradas,
      relogiosDesconhecidos,
      semEmpresa,
    };
  }

  async function previewVinculos({ matriculas, numSeries, acao, companyIds }) {
    await ensureSchema();
    const plano = await montarPlano({ matriculas, numSeries, acao, companyIds });

    return {
      success: true,
      acao: plano.acao,
      resumo: plano.resumo,
      alteracoes: plano.alteracoes.slice(0, PREVIEW_LIMIT),
      truncado: plano.alteracoes.length > PREVIEW_LIMIT,
      matriculasNaoEncontradas: plano.naoEncontradas.slice(0, PREVIEW_LIMIT),
      relogiosDesconhecidos: plano.relogiosDesconhecidos.slice(0, PREVIEW_LIMIT),
      semEmpresa: plano.semEmpresa.slice(0, PREVIEW_LIMIT),
    };
  }

  async function chamarApiVinculos(company, acao, pares) {
    const status = acao === 'vincular';
    const lstFuncRel = pares.map((par) => ({
      MatriculaFuncionario: par.matricula,
      NumSerieRelogio: par.num_serie,
      Status: status,
    }));

    try {
      const resposta = await pontoApi.callOperation(company, 'vinculaFuncionarioRelogio', {
        lstFuncRel,
      });
      if (typeof resposta === 'string') {
        throw new Error(resposta);
      }
      if (Array.isArray(resposta) && resposta.length > 0) {
        return { ok: true, parcial: false, paresOk: pares };
      }
    } catch (error) {
      if (error?.tokenError) throw error;
      // Segue para o fallback por lista.
    }

    // Fallback agrupado por matrícula: preserva o conjunto exato de pares do
    // lote, sem criar combinações extras.
    const porMatricula = new Map();
    for (const par of pares) {
      if (!porMatricula.has(par.matricula)) porMatricula.set(par.matricula, []);
      porMatricula.get(par.matricula).push(par.num_serie);
    }

    let falhas = 0;
    const paresOk = [];
    for (const [matricula, numSeries] of porMatricula) {
      try {
        const resposta = await pontoApi.callOperation(company, 'VinculaFuncionarioRelogioPorLista', {
          vinculosFuncionarioRelogio: [{
            MatriculasFuncionarios: [matricula],
            NumerosSerieRelogios: numSeries,
            Vincular: status,
          }],
        });
        if (typeof resposta === 'string') throw new Error(resposta);
        if (!Array.isArray(resposta) || resposta.length === 0) throw new Error('Resposta vazia');

        for (const numSerie of numSeries) {
          paresOk.push({ matricula, num_serie: numSerie });
        }
      } catch (error) {
        if (error?.tokenError) throw error;
        falhas++;
      }
    }

    return { ok: falhas === 0, parcial: falhas > 0, falhas, paresOk };
  }

  async function garantirRelogioId(numSerie, cache, descricao = '') {
    const chave = normalizeNumSerie(numSerie);
    if (cache.has(chave)) return cache.get(chave);

    const [rows] = await pool.query(
      'SELECT id FROM relogios WHERE num_serie = ? LIMIT 1',
      [numSerie]
    );
    if (rows.length > 0) {
      cache.set(chave, rows[0].id);
      return rows[0].id;
    }

    const [result] = await pool.query(
      `INSERT INTO relogios (num_serie, descricao, status, ativo)
       VALUES (?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [numSerie, descricao || '']
    );
    const id = result.insertId;
    cache.set(chave, id);
    return id;
  }

  async function aplicarLocal(alteracoes, { acao, relogioIdCache }) {
    if (alteracoes.length === 0) return;

    const status = acao === 'vincular' ? 1 : 0;
    const values = [];

    for (const alteracao of alteracoes) {
      const relogioId = await garantirRelogioId(
        alteracao.num_serie,
        relogioIdCache,
        alteracao.descricao
      );
      values.push([relogioId, alteracao.matricula, status]);
    }

    for (const lote of chunk(values, CHUNK_SIZE)) {
      await pool.query(
        `INSERT INTO relogio_funcionario (relogio_id, matricula, status)
         VALUES ?
         ON DUPLICATE KEY UPDATE status = VALUES(status), atualizado_em = NOW()`,
        [lote]
      );
    }
  }

  async function salvarEstado(companyId, { tipo, vinculados, desvinculados }) {
    await pool.query(
      `INSERT INTO vinculo_sync_estado
         (empresa_config_id, ultima_sincronizacao_em, ultima_sincronizacao_tipo,
          ultimo_total_vinculado, ultimo_total_desvinculado)
       VALUES (?, NOW(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ultima_sincronizacao_em = NOW(),
         ultima_sincronizacao_tipo = VALUES(ultima_sincronizacao_tipo),
         ultimo_total_vinculado = VALUES(ultimo_total_vinculado),
         ultimo_total_desvinculado = VALUES(ultimo_total_desvinculado)`,
      [
        companyId,
        tipo,
        Math.max(0, Number(vinculados) || 0),
        Math.max(0, Number(desvinculados) || 0),
      ]
    );
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
   * Aplica vinculações/desvinculações.
   * Somente os pares que realmente mudam de estado são enviados à API.
   */
  async function aplicarVinculos({ matriculas, numSeries, acao, companyIds, usuario = null }) {
    await ensureSchema();

    const iniciadoEm = Date.now();
    const plano = await montarPlano({ matriculas, numSeries, acao, companyIds });
    const relogioIdCache = new Map();
    const porEmpresa = new Map();

    for (const alteracao of plano.alteracoes) {
      const key = Number(alteracao.empresa_config_id);
      if (!porEmpresa.has(key)) porEmpresa.set(key, []);
      porEmpresa.get(key).push(alteracao);
    }

    const resultados = [];
    let totalVinculados = 0;
    let totalDesvinculados = 0;
    let totalErros = 0;

    for (const [companyId, alteracoes] of porEmpresa) {
      const company = plano.companies.find((c) => Number(c.id) === Number(companyId));
      const resultado = {
        empresa_config_id: companyId,
        nome: company?.nome || `Empresa ${companyId}`,
        vinculados: 0,
        desvinculados: 0,
        erros: 0,
        erro: null,
      };

      try {
        for (const lote of chunk(alteracoes, API_BATCH_SIZE)) {
          const resposta = await chamarApiVinculos(company, acao, lote);
          const paresOk = resposta.paresOk || [];

          if (paresOk.length > 0) {
            // A resposta do fallback já traz uma cópia dos pares; complete com
            // a descrição do relógio usada ao criar registros locais ausentes.
            const descricaoPorPar = new Map(
              lote.map((par) => [chavePar(par.matricula, par.num_serie), par.descricao])
            );
            const paresCompletos = paresOk.map((par) => ({
              ...par,
              descricao: descricaoPorPar.get(chavePar(par.matricula, par.num_serie)) || '',
            }));

            await aplicarLocal(paresCompletos, { acao, relogioIdCache });

            if (acao === 'vincular') resultado.vinculados += paresCompletos.length;
            else resultado.desvinculados += paresCompletos.length;
          }

          if (!resposta.ok) {
            resultado.erros += Math.max(0, lote.length - paresOk.length);
          }
        }
      } catch (error) {
        resultado.erro = error?.message || String(error);
        resultado.erros += alteracoes.length;
        console.error(`[Vínculos] Empresa ${resultado.nome}:`, resultado.erro);
      }

      totalVinculados += resultado.vinculados;
      totalDesvinculados += resultado.desvinculados;
      totalErros += resultado.erros;
      resultados.push(resultado);

      if (resultado.vinculados > 0 || resultado.desvinculados > 0) {
        await salvarEstado(companyId, {
          tipo: 'APLICAR',
          vinculados: resultado.vinculados,
          desvinculados: resultado.desvinculados,
        });
      }
    }

    const status = totalErros === 0
      ? 'CONCLUIDO'
      : ((totalVinculados + totalDesvinculados) === 0 ? 'ERRO' : 'PARCIAL');

    const resumo = {
      acao,
      matriculas: plano.resumo.funcionarios,
      relogios: plano.resumo.relogios,
      combinacoes: plano.resumo.combinacoes,
      alteracoesPlanejadas: plano.alteracoes.length,
      jaAplicados: plano.resumo.jaAplicados,
      semEmpresa: plano.semEmpresa,
      vinculados: totalVinculados,
      desvinculados: totalDesvinculados,
      erros: totalErros,
      empresas: resultados,
    };

    const duracaoMs = Date.now() - iniciadoEm;
    const execucaoId = await registrarExecucao({
      tipo: 'VINCULOS',
      status,
      usuario,
      iniciadoEm,
      duracaoMs,
      empresasProcessadas: resultados.length,
      resumo,
      erro: totalErros > 0
        ? resultados.filter((r) => r.erro).map((r) => `${r.nome}: ${r.erro}`).join('; ') || `${totalErros} par(es) com erro`
        : null,
    });

    return {
      success: totalErros === 0,
      execucaoId,
      status,
      acao,
      duracaoMs,
      resumo: plano.resumo,
      empresas: resultados,
      vinculados: totalVinculados,
      desvinculados: totalDesvinculados,
      erros: totalErros,
    };
  }

  async function sincronizarFuncionario(company, funcionario) {
    const resposta = await pontoApi.callOperation(company, 'RetornaRelogiosPorMatricula', {
      matricula: funcionario.matricula,
    });

    if (typeof resposta === 'string') {
      throw new Error(resposta);
    }
    if (resposta !== null && resposta !== undefined && !Array.isArray(resposta)) {
      throw new Error('Resposta inválida de RetornaRelogiosPorMatricula');
    }

    const ativos = new Map();
    for (const item of resposta || []) {
      const numSerieOriginal = String(item?.NumSerieRelogio ?? '').trim();
      const numSerie = normalizeNumSerie(numSerieOriginal);
      if (!numSerie) continue;
      ativos.set(numSerie, {
        ativo: apiAtivo(item?.Status),
        numSerieOriginal: numSerieOriginal || numSerie,
      });
    }
    return ativos;
  }

  /**
   * Importa os vínculos existentes na API para o banco local.
   * Sem filtro de matrículas, sincroniza todos os funcionários das empresas
   * selecionadas (uso típico da carga inicial).
   */
  async function runVinculosSync({ companyIds, matriculas, usuario = null } = {}) {
    await ensureSchema();

    const iniciadoEm = Date.now();
    const companies = await loadCompanies(companyIds);
    if (companies.length === 0) {
      throw new Error('Nenhuma empresa de API ativa encontrada para sincronizar vínculos');
    }

    const matriculasNormalizadas = toArrayUnique(matriculas, normalizeMatricula);
    let funcionarios;
    if (matriculasNormalizadas.length > 0) {
      funcionarios = [...(await carregarFuncionarios(matriculasNormalizadas)).values()];
    } else {
      const [rows] = await pool.query(
        `SELECT id, matricula, nome, ativo, empresa_id, empresa
         FROM qrcod_2023
         WHERE ativo = 1
         ORDER BY nome ASC`
      );
      funcionarios = rows;
    }

    const porEmpresa = new Map();
    const semEmpresa = [];
    for (const funcionario of funcionarios) {
      const company = resolveCompanyForEmployee(funcionario, companies);
      if (!company) {
        semEmpresa.push({ matricula: normalizeMatricula(funcionario.matricula), nome: funcionario.nome || '' });
        continue;
      }
      const key = Number(company.id);
      if (!porEmpresa.has(key)) porEmpresa.set(key, { company, funcionarios: [] });
      porEmpresa.get(key).funcionarios.push(funcionario);
    }

    const { porNumSerie: relogiosPorNumSerie } = await carregarRelogios();
    const relogioIdCache = new Map(
      [...relogiosPorNumSerie.entries()].map(([key, value]) => [key, value.id])
    );

    const resultados = [];
    let totalVinculados = 0;
    let totalDesvinculados = 0;
    let totalInalterados = 0;
    let totalErros = 0;

    for (const { company, funcionarios: lista } of porEmpresa.values()) {
      const resultado = {
        empresa_config_id: company.id,
        nome: company.nome,
        funcionarios: lista.length,
        vinculados: 0,
        desvinculados: 0,
        inalterados: 0,
        erros: 0,
        erro: null,
      };

      // Carrega os vínculos locais de todos os funcionários da empresa de uma
      // vez, evitando uma consulta por funcionário.
      const vinculosLocaisPorMatricula = new Map();
      const matriculasEmpresa = lista.map((f) => normalizeMatricula(f.matricula));
      for (const lote of chunk(matriculasEmpresa, CHUNK_SIZE)) {
        if (lote.length === 0) continue;
        const [rows] = await pool.query(
          `SELECT rf.matricula, rf.status, r.num_serie
           FROM relogio_funcionario rf
           INNER JOIN relogios r ON r.id = rf.relogio_id
           WHERE rf.matricula IN (?)`,
          [lote]
        );
        for (const row of rows) {
          const matricula = normalizeMatricula(row.matricula);
          if (!vinculosLocaisPorMatricula.has(matricula)) {
            vinculosLocaisPorMatricula.set(matricula, []);
          }
          vinculosLocaisPorMatricula.get(matricula).push(row);
        }
      }

      const vinculos = await mapWithConcurrency(lista, SYNC_CONCURRENCY, async (funcionario) => {
        try {
          const ativos = await sincronizarFuncionario(company, funcionario);
          return { funcionario, ativos, erro: null };
        } catch (error) {
          return {
            funcionario,
            ativos: null,
            erro: error?.message || String(error),
          };
        }
      });

      for (const item of vinculos) {
        if (item.erro) {
          resultado.erros++;
          continue;
        }

        const matricula = normalizeMatricula(item.funcionario.matricula);
        const locaisRows = vinculosLocaisPorMatricula.get(matricula) || [];

        const locaisAtivos = new Set();
        for (const row of locaisRows) {
          if (Number(row.status) === 1) locaisAtivos.add(normalizeNumSerie(row.num_serie));
        }

        const ativosApi = new Set(
          [...item.ativos.entries()]
            .filter(([, vinculado]) => vinculado.ativo)
            .map(([numSerie]) => numSerie)
        );

        const paraVincular = [...ativosApi].filter((numSerie) => !locaisAtivos.has(numSerie));
        const paraDesvincular = [...locaisAtivos].filter((numSerie) => !ativosApi.has(numSerie));

        if (paraVincular.length === 0 && paraDesvincular.length === 0) {
          resultado.inalterados++;
          continue;
        }

        // Ativa os vínculos que existem na API.
        for (const lote of chunk(paraVincular, CHUNK_SIZE)) {
          const values = [];
          for (const numSerie of lote) {
            const relogioId = await garantirRelogioId(
              item.ativos.get(numSerie)?.numSerieOriginal || numSerie,
              relogioIdCache,
              relogiosPorNumSerie.get(numSerie)?.descricao || ''
            );
            values.push([relogioId, matricula, 1]);
          }
          await pool.query(
            `INSERT INTO relogio_funcionario (relogio_id, matricula, status)
             VALUES ?
             ON DUPLICATE KEY UPDATE status = 1, atualizado_em = NOW()`,
            [values]
          );
        }

        // Desativa somente vínculos locais comuns (status 1); registros com
        // status -1 são exclusões manuais e são preservados.
        for (const lote of chunk(paraDesvincular, CHUNK_SIZE)) {
          const values = [];
          for (const numSerie of lote) {
            const relogio = relogiosPorNumSerie.get(numSerie);
            if (relogio) values.push([relogio.id, matricula]);
          }
          if (values.length > 0) {
            const relogioIds = values.map((v) => v[0]);
            await pool.query(
              `UPDATE relogio_funcionario
               SET status = 0, atualizado_em = NOW()
               WHERE relogio_id IN (?) AND matricula = ? AND status = 1`,
              [relogioIds, matricula]
            );
          }
        }

        resultado.vinculados += paraVincular.length;
        resultado.desvinculados += paraDesvincular.length;
      }

      totalVinculados += resultado.vinculados;
      totalDesvinculados += resultado.desvinculados;
      totalInalterados += resultado.inalterados;
      totalErros += resultado.erros;
      resultados.push(resultado);

      await salvarEstado(company.id, {
        tipo: 'SINCRONIZAR',
        vinculados: resultado.vinculados,
        desvinculados: resultado.desvinculados,
      });
    }

    const status = totalErros === 0
      ? 'CONCLUIDO'
      : ((totalVinculados + totalDesvinculados) === 0 && totalInalterados === 0 ? 'ERRO' : 'PARCIAL');

    const resumo = {
      funcionarios: funcionarios.length,
      vinculados: totalVinculados,
      desvinculados: totalDesvinculados,
      inalterados: totalInalterados,
      erros: totalErros,
      semEmpresa,
      empresas: resultados,
    };

    const duracaoMs = Date.now() - iniciadoEm;
    const execucaoId = await registrarExecucao({
      tipo: 'VINCULOS_SYNC',
      status,
      usuario,
      iniciadoEm,
      duracaoMs,
      empresasProcessadas: resultados.length,
      resumo,
      erro: totalErros > 0 ? `${totalErros} funcionário(s) com erro` : null,
    });

    return {
      success: totalErros === 0,
      execucaoId,
      status,
      duracaoMs,
      resumo,
      empresas: resultados,
      vinculados: totalVinculados,
      desvinculados: totalDesvinculados,
      inalterados: totalInalterados,
      erros: totalErros,
    };
  }

  async function getVinculosStatus() {
    await ensureSchema();

    const [rows] = await pool.query(
      `SELECT ec.id AS empresa_config_id,
              ec.nome,
              ec.ativo,
              ec.empresa_id,
              e.nome AS empresa_nome,
              COALESCE(vs.ultima_sincronizacao_em, NULL) AS ultima_sincronizacao_em,
              vs.ultima_sincronizacao_tipo,
              COALESCE(vs.ultimo_total_vinculado, 0) AS ultimo_total_vinculado,
              COALESCE(vs.ultimo_total_desvinculado, 0) AS ultimo_total_desvinculado,
              (
                SELECT COUNT(*)
                FROM qrcod_2023 q
                WHERE q.empresa_id = ec.empresa_id
              ) AS total_funcionarios,
              (
                SELECT COUNT(*)
                FROM relogio_funcionario rf
                INNER JOIN qrcod_2023 q ON q.matricula = rf.matricula
                WHERE rf.status = 1 AND q.empresa_id = ec.empresa_id
              ) AS total_vinculos_ativos
       FROM empresas_config ec
       LEFT JOIN empresas e ON e.id = ec.empresa_id
       LEFT JOIN vinculo_sync_estado vs ON vs.empresa_config_id = ec.id
       ORDER BY ec.nome ASC`
    );

    const [relogiosRows] = await pool.query('SELECT COUNT(*) AS total FROM relogios');
    const totalRelogios = Number(relogiosRows[0]?.total) || 0;

    return rows.map((row) => ({
      ...row,
      total_relogios: totalRelogios,
    }));
  }

  async function getOpcoes() {
    await ensureSchema();

    const [funcionarios] = await pool.query(
      `SELECT id, matricula, nome, ativo, empresa_id, empresa
       FROM qrcod_2023
       ORDER BY nome ASC`
    );

    const [relogios] = await pool.query(
      `SELECT id, num_serie, descricao, ativo, status
       FROM relogios
       ORDER BY descricao ASC, num_serie ASC`
    );

    return { funcionarios, relogios };
  }

  return {
    ensureSchema,
    previewVinculos,
    aplicarVinculos,
    runVinculosSync,
    getVinculosStatus,
    getOpcoes,
  };
}

module.exports = {
  createPontoVinculos,
  normalizeMatricula,
  normalizeNumSerie,
  normalizeTexto,
};
