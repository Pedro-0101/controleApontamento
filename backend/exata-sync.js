/**
 * Sincronização de empresas e funcionários da ExataWeb (somente leitura).
 *
 * Responsabilidades da Fase 2:
 *  - Descobrir todas as empresas da conta (GET /empresas) e persistir em
 *    `empresas_exata`, com mapeamento automático/manual para `empresas`.
 *  - Importar funcionários de cada empresa ativa para `funcionario_exata`.
 *  - Espelhar funcionários novos em `qrcod_2023` para aparecerem nos
 *    relatórios locais, sem alterar vínculos/cargos/status já existentes.
 *  - Auditar cada execução em `sincronizacao_execucao`.
 */

const { ensureExataSchema } = require('./exata-schema');

const CHAVE_CONTA_EXATA = 'exata';
const NOME_CONTA_EXATA = 'ExataWeb';
const CHUNK_SIZE = 500;

function normalizeTexto(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function matriculaToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function textoOuNull(value) {
  if (value === null || value === undefined) return null;
  const texto = String(value).trim();
  return texto.length > 0 ? texto : null;
}

function numeroOuNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numero = Number(value);
  return Number.isFinite(numero) ? numero : null;
}

function inteiroOuNull(value) {
  const numero = numeroOuNull(value);
  return numero === null ? null : Math.trunc(numero);
}

function validarData(ano, mes, dia) {
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  return data.getUTCFullYear() === Number(ano)
    && data.getUTCMonth() === Number(mes) - 1
    && data.getUTCDate() === Number(dia);
}

/** Converte DD/MM/AAAA ou AAAA-MM-DD em AAAA-MM-DD (sem conversão de fuso). */
function parseDateOnly(value) {
  const texto = textoOuNull(value);
  if (!texto) return null;

  let match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match && validarData(match[3], match[2], match[1])) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match && validarData(match[1], match[2], match[3])) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  return null;
}

/**
 * Converte datas/horas da API em DATETIME MySQL sem converter timezone.
 * Aceita DD/MM/AAAA, AAAA-MM-DD, AAAA-MM-DDTHH:mm:ss... e DD/MM/AAAA HH:mm:ss.
 */
function parseDateTime(value) {
  const texto = textoOuNull(value);
  if (!texto) return null;

  let match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match && validarData(match[3], match[2], match[1])) {
    const hora = match[4] ? `${match[4]}:${match[5]}:${match[6] || '00'}` : '00:00:00';
    return `${match[3]}-${match[2]}-${match[1]} ${hora}`;
  }

  match = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match && validarData(match[1], match[2], match[3])) {
    const hora = match[4] ? `${match[4]}:${match[5]}:${match[6] || '00'}` : '00:00:00';
    return `${match[1]}-${match[2]}-${match[3]} ${hora}`;
  }

  return null;
}

function apiAtivo(item) {
  return item?.ativo === 'S' || item?.ativo === true || item?.status === 'S' ? 1 : 0;
}

function encontrarEmpresaLocal(descricao, empresas) {
  const alvo = normalizeTexto(descricao);
  if (!alvo) return null;

  const exatas = empresas.filter((empresa) => normalizeTexto(empresa.nome) === alvo);
  if (exatas.length === 1) return exatas[0];

  const parciais = empresas.filter((empresa) => {
    const nome = normalizeTexto(empresa.nome);
    return nome.length >= 2 && (alvo.includes(nome) || nome.includes(alvo));
  });

  return parciais.length === 1 ? parciais[0] : null;
}

function normalizarFuncionario(item, empresaConfigId, empresasistema) {
  const matricula = matriculaToString(item?.matricula);
  if (!matricula) return null;

  return {
    empresa_config_id: empresaConfigId,
    empresasistema,
    matricula,
    pis: textoOuNull(item?.pis),
    cpf: textoOuNull(item?.cpf),
    codturma: textoOuNull(item?.codturma),
    descricao_turma: textoOuNull(item?.descricaoTurma),
    cartao: textoOuNull(item?.cartao),
    nome: textoOuNull(item?.nome),
    email: textoOuNull(item?.email),
    cod_erp: textoOuNull(item?.codErp),
    centro_custo: textoOuNull(item?.centroCusto),
    cod_funcao: textoOuNull(item?.codFuncao),
    cod_setor: textoOuNull(item?.codSetor),
    desc_setor: textoOuNull(item?.descSetor),
    admissao: parseDateOnly(item?.admissao),
    intervalo_minimo: inteiroOuNull(item?.intervaloMinimo),
    status: textoOuNull(item?.status),
    status_inicio: parseDateTime(item?.statusInicio),
    status_fim: parseDateTime(item?.statusFim),
    ultima_modificacao: parseDateTime(item?.ultimamodificacao),
    _ativo_local: apiAtivo(item),
    _nome_local: textoOuNull(item?.nome),
  };
}

const FUNCIONARIO_COLUNAS = [
  'empresa_config_id',
  'empresasistema',
  'matricula',
  'pis',
  'cpf',
  'codturma',
  'descricao_turma',
  'cartao',
  'nome',
  'email',
  'cod_erp',
  'centro_custo',
  'cod_funcao',
  'cod_setor',
  'desc_setor',
  'admissao',
  'intervalo_minimo',
  'status',
  'status_inicio',
  'status_fim',
  'ultima_modificacao',
];

function createExataSync({ pool, exataApi }) {
  if (!exataApi) throw new Error('exataApi é obrigatório para a sincronização Exata');

  async function ensureSchema() {
    await ensureExataSchema(pool);
  }

  async function getContaExata() {
    await pool.query(
      `INSERT INTO empresas_config (nome, email, senha, chave, ativo, provedor)
       VALUES (?, '', '', ?, 1, 'exata')
       ON DUPLICATE KEY UPDATE provedor = 'exata'`,
      [NOME_CONTA_EXATA, CHAVE_CONTA_EXATA]
    );

    const [rows] = await pool.query(
      `SELECT id, nome, ativo, provedor
         FROM empresas_config
        WHERE chave = ?
        LIMIT 1`,
      [CHAVE_CONTA_EXATA]
    );
    return rows[0];
  }

  async function carregarEmpresasLocais() {
    const [rows] = await pool.query('SELECT id, nome FROM empresas ORDER BY nome ASC');
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

  async function resumoEmpresas(contaId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN empresa_id IS NOT NULL THEN 1 ELSE 0 END) AS mapeadas,
              SUM(CASE WHEN empresa_id IS NULL THEN 1 ELSE 0 END) AS sem_mapeamento,
              SUM(CASE WHEN ativo = 0 THEN 1 ELSE 0 END) AS inativas
         FROM empresas_exata
        WHERE empresa_config_id = ?`,
      [contaId]
    );
    const row = rows[0] || {};
    return {
      total: Number(row.total) || 0,
      mapeadas: Number(row.mapeadas) || 0,
      semMapeamento: Number(row.sem_mapeamento) || 0,
      inativas: Number(row.inativas) || 0,
    };
  }

  async function listarEmpresasExata() {
    await ensureSchema();
    const conta = await getContaExata();
    const empresasLocais = await carregarEmpresasLocais();

    const [empresas] = await pool.query(
      `SELECT ee.id, ee.empresa_config_id, ee.empresasistema, ee.empresacliente,
              ee.descricao, ee.empresa_id, ee.ativo, ee.sincronizado_em,
              e.nome AS empresa_nome,
              (SELECT COUNT(*)
                 FROM funcionario_exata fe
                WHERE fe.empresa_config_id = ee.empresa_config_id
                  AND fe.empresasistema = ee.empresasistema) AS total_funcionarios
         FROM empresas_exata ee
         LEFT JOIN empresas e ON e.id = ee.empresa_id
        WHERE ee.empresa_config_id = ?
        ORDER BY ee.descricao ASC, ee.empresasistema ASC`,
      [conta.id]
    );

    const [ultimaExecucaoRows] = await pool.query(
      `SELECT id, tipo, status, iniciado_em, finalizado_em, duracao_ms, resumo, erro
         FROM sincronizacao_execucao
        WHERE tipo LIKE 'EXATA_%'
        ORDER BY id DESC
        LIMIT 1`
    );

    return {
      success: true,
      conta: {
        ...conta,
        ultima_execucao: ultimaExecucaoRows[0] || null,
      },
      empresas: empresas.map((empresa) => ({
        ...empresa,
        ativo: Number(empresa.ativo) ? 1 : 0,
        total_funcionarios: Number(empresa.total_funcionarios) || 0,
      })),
      resumo: await resumoEmpresas(conta.id),
      empresasLocais,
    };
  }

  async function sincronizarEmpresas({ usuario = null } = {}) {
    await ensureSchema();
    const conta = await getContaExata();
    const empresasLocais = await carregarEmpresasLocais();
    const iniciadoEm = Date.now();

    const resposta = await exataApi.listarEmpresas();
    if (!Array.isArray(resposta)) {
      throw new Error('Resposta inválida de /empresas da ExataWeb');
    }

    const stats = {
      recebidas: resposta.length,
      inseridas: 0,
      atualizadas: 0,
      ignoradas: 0,
      mapeadas: 0,
      semMapeamento: 0,
    };
    const erros = [];

    for (const item of resposta) {
      const empresasistema = Number(item?.empresasistema);
      if (!Number.isInteger(empresasistema) || empresasistema < 0) {
        stats.ignoradas++;
        continue;
      }

      try {
        const [existentes] = await pool.query(
          `SELECT id, empresa_id
             FROM empresas_exata
            WHERE empresa_config_id = ? AND empresasistema = ?
            LIMIT 1`,
          [conta.id, empresasistema]
        );
        const existente = existentes[0] || null;

        let empresaLocalId = null;
        if (!existente || existingSemMapeamento(existente)) {
          const local = encontrarEmpresaLocal(item?.descricao, empresasLocais);
          if (local) empresaLocalId = local.id;
        }

        await pool.query(
          `INSERT INTO empresas_exata
             (empresa_config_id, empresasistema, empresacliente, descricao,
              empresa_org_erp, filial_estabe_erp, deposito_req_interna,
              empresa_id, ativo, sincronizado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
           ON DUPLICATE KEY UPDATE
             empresacliente = VALUES(empresacliente),
             descricao = VALUES(descricao),
             empresa_org_erp = VALUES(empresa_org_erp),
             filial_estabe_erp = VALUES(filial_estabe_erp),
             deposito_req_interna = VALUES(deposito_req_interna),
             empresa_id = COALESCE(empresa_id, VALUES(empresa_id)),
             sincronizado_em = NOW()`,
          [
            conta.id,
            empresasistema,
            numeroOuNull(item?.empresacliente),
            textoOuNull(item?.descricao),
            textoOuNull(item?.empresaOrgErp),
            textoOuNull(item?.filialEstabeErp),
            textoOuNull(item?.depositoReqInterna),
            empresaLocalId,
          ]
        );

        if (existente) stats.atualizadas++;
        else stats.inseridas++;
      } catch (error) {
        erros.push({
          empresasistema,
          descricao: item?.descricao || null,
          erro: error?.message || String(error),
        });
      }
    }

    const resumo = await resumoEmpresas(conta.id);
    stats.mapeadas = resumo.mapeadas;
    stats.semMapeamento = resumo.semMapeamento;

    const duracaoMs = Date.now() - iniciadoEm;
    const status = erros.length === 0
      ? 'CONCLUIDO'
      : (erros.length === resposta.length ? 'ERRO' : 'PARCIAL');

    const execucaoId = await registrarExecucao({
      tipo: 'EXATA_EMPRESAS',
      status,
      usuario,
      iniciadoEm,
      duracaoMs,
      empresasProcessadas: resposta.length,
      resumo: stats,
      erro: erros.length > 0 ? JSON.stringify(erros).slice(0, 60000) : null,
    });

    return {
      success: erros.length === 0,
      execucaoId,
      status,
      duracaoMs,
      ...stats,
      erros,
    };
  }

  function existingSemMapeamento(existente) {
    return !existente?.empresa_id;
  }

  async function atualizarEmpresaExata(id, { empresa_id, ativo } = {}) {
    await ensureSchema();
    const conta = await getContaExata();
    const empresaExataId = Number(id);
    if (!Number.isFinite(empresaExataId)) {
      throw new Error('Empresa Exata inválida');
    }

    const [rows] = await pool.query(
      `SELECT id FROM empresas_exata WHERE id = ? AND empresa_config_id = ? LIMIT 1`,
      [empresaExataId, conta.id]
    );
    if (rows.length === 0) throw new Error('Empresa Exata não encontrada');

    const sets = [];
    const params = [];

    if (empresa_id !== undefined) {
      if (empresa_id === null || empresa_id === '') {
        sets.push('empresa_id = NULL');
      } else {
        const localId = Number(empresa_id);
        if (!Number.isFinite(localId)) throw new Error('Empresa local inválida');
        const [local] = await pool.query('SELECT id FROM empresas WHERE id = ? LIMIT 1', [localId]);
        if (local.length === 0) throw new Error('Empresa local não encontrada');
        sets.push('empresa_id = ?');
        params.push(localId);
      }
    }

    if (ativo !== undefined) {
      sets.push('ativo = ?');
      params.push(ativo ? 1 : 0);
    }

    if (sets.length === 0) throw new Error('Nenhum campo informado para atualização');

    params.push(empresaExataId, conta.id);
    await pool.query(
      `UPDATE empresas_exata SET ${sets.join(', ')} WHERE id = ? AND empresa_config_id = ?`,
      params
    );

    const [updated] = await pool.query(
      `SELECT ee.id, ee.empresa_config_id, ee.empresasistema, ee.empresacliente,
              ee.descricao, ee.empresa_id, ee.ativo, ee.sincronizado_em,
              e.nome AS empresa_nome
         FROM empresas_exata ee
         LEFT JOIN empresas e ON e.id = ee.empresa_id
        WHERE ee.id = ?`,
      [empresaExataId]
    );
    return updated[0];
  }

  async function listarFuncionariosExata(contaId, empresasistema) {
    const resposta = await exataApi.listarFuncionarios(empresasistema);
    if (!Array.isArray(resposta)) {
      throw new Error(`Resposta inválida de /funcionarios da Exata (empresa ${empresasistema})`);
    }

    const unicos = new Map();
    let ignorados = 0;
    for (const item of resposta) {
      const row = normalizarFuncionario(item, contaId, empresasistema);
      if (!row) {
        ignorados++;
        continue;
      }
      if (unicos.has(row.matricula)) {
        ignorados++;
        continue;
      }
      unicos.set(row.matricula, row);
    }

    return { rows: [...unicos.values()], recebidos: resposta.length, ignorados };
  }

  async function persistirFuncionarios(contaId, empresasistema, rows) {
    if (rows.length === 0) return { inseridos: 0, atualizados: 0 };

    const existentes = new Set();
    const matriculas = rows.map((row) => row.matricula);

    for (let i = 0; i < matriculas.length; i += CHUNK_SIZE) {
      const chunk = matriculas.slice(i, i + CHUNK_SIZE);
      const [found] = await pool.query(
        `SELECT matricula
           FROM funcionario_exata
          WHERE empresa_config_id = ? AND empresasistema = ? AND matricula IN (?)`,
        [contaId, empresasistema, chunk]
      );
      for (const row of found) existentes.add(matriculaToString(row.matricula));
    }

    const atualizaveis = FUNCIONARIO_COLUNAS.filter(
      (coluna) => coluna !== 'empresa_config_id' && coluna !== 'empresasistema' && coluna !== 'matricula'
    );
    const sql = `
      INSERT INTO funcionario_exata (${FUNCIONARIO_COLUNAS.join(', ')})
      VALUES ?
      ON DUPLICATE KEY UPDATE
        ${atualizaveis.map((coluna) => `${coluna} = VALUES(${coluna})`).join(', ')}
    `;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values = chunk.map((row) => FUNCIONARIO_COLUNAS.map((coluna) => row[coluna] ?? null));
      await pool.query(sql, [values]);
    }

    let inseridos = 0;
    let atualizados = 0;
    for (const row of rows) {
      if (existentes.has(row.matricula)) atualizados++;
      else inseridos++;
    }

    return { inseridos, atualizados };
  }

  /**
   * Espelha em qrcod_2023 apenas matrículas que ainda não existem em nenhuma
   * empresa local. Funcionários já cadastrados nunca são alterados.
   */
  async function espelharFuncionariosLocais(rows, empresaLocal) {
    const stats = { inseridos: 0, existentes: 0, semEmpresaLocal: 0 };
    const matriculas = rows.map((row) => row.matricula);

    const existentes = new Set();
    for (let i = 0; i < matriculas.length; i += CHUNK_SIZE) {
      const chunk = matriculas.slice(i, i + CHUNK_SIZE);
      const [found] = await pool.query(
        'SELECT DISTINCT matricula FROM qrcod_2023 WHERE matricula IN (?)',
        [chunk]
      );
      for (const row of found) existentes.add(matriculaToString(row.matricula));
    }

    for (const row of rows) {
      if (existentes.has(row.matricula)) {
        stats.existentes++;
        continue;
      }
      if (!empresaLocal) {
        stats.semEmpresaLocal++;
        continue;
      }

      await pool.query(
        `INSERT INTO qrcod_2023
           (matricula, empresa_id, empresa, nome, cargo, ativo, trabalha_sabado, bate_ponto, local)
         VALUES (?, ?, ?, ?, '', ?, 1, 1, '')`,
        [
          row.matricula,
          empresaLocal.id,
          empresaLocal.nome,
          row._nome_local || '',
          row._ativo_local ? 1 : 0,
        ]
      );
      existentes.add(row.matricula);
      stats.inseridos++;
    }

    return stats;
  }

  async function sincronizarFuncionarios({ empresasExataIds, usuario = null } = {}) {
    await ensureSchema();
    const conta = await getContaExata();
    const iniciadoEm = Date.now();

    const ids = Array.isArray(empresasExataIds)
      ? empresasExataIds.map(Number).filter(Number.isFinite)
      : [];

    const params = [conta.id];
    let filtro = 'WHERE empresa_config_id = ? AND ativo = 1';
    if (ids.length > 0) {
      filtro += ' AND id IN (?)';
      params.push(ids);
    }

    const [empresas] = await pool.query(
      `SELECT id, empresasistema, descricao, empresa_id
         FROM empresas_exata
         ${filtro}
         ORDER BY descricao ASC, empresasistema ASC`,
      params
    );

    if (empresas.length === 0) {
      throw new Error('Nenhuma empresa Exata ativa encontrada para sincronizar funcionários');
    }

    const empresasLocais = await carregarEmpresasLocais();
    const resultados = [];
    let totalComErro = 0;
    const totais = {
      recebidos: 0,
      inseridos: 0,
      atualizados: 0,
      ignorados: 0,
      locaisInseridos: 0,
      semEmpresaLocal: 0,
    };

    for (const empresa of empresas) {
      const resultado = {
        empresa_exata_id: empresa.id,
        empresasistema: empresa.empresasistema,
        descricao: empresa.descricao,
        empresa_id: empresa.empresa_id,
        empresa_nome: null,
        recebidos: 0,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        locais_inseridos: 0,
        sem_empresa_local: 0,
        erro: null,
      };

      const local = empresa.empresa_id
        ? empresasLocais.find((item) => Number(item.id) === Number(empresa.empresa_id))
        : null;
      resultado.empresa_nome = local?.nome || null;

      try {
        const { rows, recebidos, ignorados } = await listarFuncionariosExata(
          conta.id,
          empresa.empresasistema
        );
        const persistido = await persistirFuncionarios(conta.id, empresa.empresasistema, rows);
        const espelho = await espelharFuncionariosLocais(rows, local);

        resultado.recebidos = recebidos;
        resultado.inseridos = persistido.inseridos;
        resultado.atualizados = persistido.atualizados;
        resultado.ignorados = ignorados;
        resultado.locais_inseridos = espelho.inseridos;
        resultado.sem_empresa_local = espelho.semEmpresaLocal;

        totais.recebidos += recebidos;
        totais.inseridos += persistido.inseridos;
        totais.atualizados += persistido.atualizados;
        totais.ignorados += ignorados;
        totais.locaisInseridos += espelho.inseridos;
        totais.semEmpresaLocal += espelho.semEmpresaLocal;
      } catch (error) {
        totalComErro++;
        resultado.erro = error?.message || String(error);
        console.error(`[Exata] Funcionários da empresa ${empresa.empresasistema}:`, resultado.erro);
      }

      resultados.push(resultado);
    }

    const duracaoMs = Date.now() - iniciadoEm;
    const status = totalComErro === 0
      ? 'CONCLUIDO'
      : (totalComErro === empresas.length ? 'ERRO' : 'PARCIAL');

    const resumo = { ...totais, empresas: resultados };
    const execucaoId = await registrarExecucao({
      tipo: 'EXATA_FUNCIONARIOS',
      status,
      usuario,
      iniciadoEm,
      duracaoMs,
      empresasProcessadas: resultados.length,
      resumo,
      erro: totalComErro > 0
        ? resultados.filter((r) => r.erro).map((r) => `${r.descricao || r.empresasistema}: ${r.erro}`).join('; ')
        : null,
    });

    return {
      success: totalComErro === 0,
      execucaoId,
      status,
      duracaoMs,
      ...totais,
      empresas: resultados,
    };
  }

  return {
    ensureSchema,
    getContaExata,
    listarEmpresasExata,
    sincronizarEmpresas,
    atualizarEmpresaExata,
    sincronizarFuncionarios,
    // expostos para testes/uso pontual
    normalizarFuncionario,
    parseDateOnly,
    parseDateTime,
    encontrarEmpresaLocal,
  };
}

module.exports = {
  createExataSync,
  normalizarFuncionario,
  parseDateOnly,
  parseDateTime,
  encontrarEmpresaLocal,
  matriculaToString,
};
