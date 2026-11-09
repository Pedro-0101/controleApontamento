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
const MARCACOES_CHUNK_SIZE = 500;

const EVENTOS_LOCAIS = [
  'Ferias',
  'Atestado',
  'Afastado',
  'Suspensao',
  'Feriado',
  'BH',
  'Licença Maternidade/ Paternidade',
  'Licença Nojo',
];

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

/** Converte Date (mysql2) ou texto em AAAA-MM-DD sem conversão de fuso. */
function dataParaIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const texto = textoOuNull(value);
  if (!texto) return null;
  return parseDateOnly(texto) || texto.slice(0, 10);
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

/** Colunas gravadas em `marcacoes_ponto` para uma marcação da Exata. */
const MARCACAO_EXATA_COLUNAS = [
  'empresa_config_id',
  'empresa_id',
  'marcacao_id',
  'nsr',
  'data_marcacao',
  'data_insercao',
  'matricula',
  'cpf',
  'pis',
  'num_serie_relogio',
  'tipo_registro',
  'gps_latitude',
  'gps_longitude',
  'provedor',
  'empresasistema',
  'reppid',
  'coletor',
  'turma',
  'hash',
  'registro',
  'tipo_coletor',
  'data_hora_coleta',
  'status_exportacao',
];

/**
 * Junta `data` (DD/MM/AAAA) e `hora` (HH:mm[:ss]) em DATETIME MySQL, sem
 * qualquer conversão de fuso horário.
 */
function montarDataHoraExata(data, hora) {
  const dataIso = parseDateOnly(data);
  if (!dataIso) return null;

  const textoHora = textoOuNull(hora) || '00:00:00';
  const match = textoHora.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return `${dataIso} 00:00:00`;

  const hh = String(Number(match[1])).padStart(2, '0');
  const mm = String(Number(match[2])).padStart(2, '0');
  const ss = String(Number(match[3] || 0)).padStart(2, '0');
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) {
    return `${dataIso} 00:00:00`;
  }
  return `${dataIso} ${hh}:${mm}:${ss}`;
}

/**
 * Normaliza um ponto da Portaria 671 para a linha de `marcacoes_ponto`.
 * A identidade é `(empresa_config_id, empresasistema, reppid, nsr)`.
 */
function normalizarPontoExata(item, empresaConfigId, empresasistema, empresaId = null) {
  const reppid = inteiroOuNull(item?.reppid);
  const nsr = inteiroOuNull(item?.nsr);
  if (reppid === null || nsr === null) return null;

  const dataMarcacao = montarDataHoraExata(item?.data, item?.hora);
  if (!dataMarcacao) return null;

  const matricula = matriculaToString(item?.matricula);
  if (!matricula) return null;

  const dataHoraColeta = parseDateTime(item?.dataHoraColeta);

  return {
    empresa_config_id: empresaConfigId,
    empresa_id: empresaId,
    marcacao_id: null,
    nsr,
    data_marcacao: dataMarcacao,
    data_insercao: dataHoraColeta,
    matricula,
    cpf: textoOuNull(item?.cpf),
    pis: textoOuNull(item?.pis),
    // O reppid é o identificador do REP-P; usamos como número de série para
    // que a marcação apareça agrupada por relógio nos relatórios.
    num_serie_relogio: String(reppid),
    tipo_registro: null,
    gps_latitude: textoOuNull(item?.latitude),
    gps_longitude: textoOuNull(item?.longitude),
    provedor: 'exata',
    empresasistema,
    reppid,
    coletor: inteiroOuNull(item?.coletor),
    turma: textoOuNull(item?.turma),
    hash: textoOuNull(item?.hash),
    registro: textoOuNull(item?.registro),
    tipo_coletor: textoOuNull(item?.tipoColetor),
    data_hora_coleta: dataHoraColeta,
    status_exportacao: textoOuNull(item?.status) || 'N',
    _status: textoOuNull(item?.status) || 'N',
  };
}

/** Divide um intervalo de datas em blocos de um dia (AAAA-MM-DD). */
function splitDiasExata(dataInicio, dataFim) {
  const inicio = parseDateOnly(dataInicio);
  const fim = parseDateOnly(dataFim);
  if (!inicio || !fim) {
    throw new Error('Período inválido: informe datas no formato DD/MM/AAAA ou AAAA-MM-DD');
  }
  if (fim < inicio) {
    throw new Error('A data final deve ser maior ou igual à data inicial');
  }

  const dias = [];
  const cursor = new Date(`${inicio}T00:00:00Z`);
  const limite = new Date(`${fim}T00:00:00Z`);

  while (cursor <= limite) {
    const dia = cursor.toISOString().slice(0, 10);
    dias.push({ inicio: dia, fim: dia });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dias.length > 3660) {
      throw new Error('Período muito longo: o máximo é de 3660 dias por execução');
    }
  }
  return dias;
}

const STATUS_EVENTO_REGRAS = [
  { regex: /ferias/, evento: 'Ferias' },
  { regex: /atestado/, evento: 'Atestado' },
  { regex: /afast/, evento: 'Afastado' },
  { regex: /suspens/, evento: 'Suspensao' },
  { regex: /feriado/, evento: 'Feriado' },
  { regex: /banco|bh/, evento: 'BH' },
  { regex: /matern|patern/, evento: 'Licença Maternidade/ Paternidade' },
  { regex: /nojo|obito|falecimento/, evento: 'Licença Nojo' },
];

/**
 * Mapeia um código/descrição de status da Exata para um dos eventos locais.
 * Retorna `null` para status neutros (Ativo, Demitido etc.).
 */
function mapStatusParaEvento(value) {
  const texto = normalizeTexto(value);
  if (!texto) return null;
  if (texto === 'ativo' || texto === 'demitido' || texto === 'inativo') return null;

  for (const regra of STATUS_EVENTO_REGRAS) {
    if (regra.regex.test(texto)) return regra.evento;
  }
  return null;
}

function normalizarStatusExata(item, empresaConfigId, empresasistema) {
  const statusId = inteiroOuNull(item?.id);
  if (statusId === null) return null;

  return {
    empresa_config_id: empresaConfigId,
    empresasistema,
    status_id: statusId,
    descricao: textoOuNull(item?.descricao),
    ponto_liberado: textoOuNull(item?.pontoLiberado),
    ativo: textoOuNull(item?.ativo),
    status_integra: textoOuNull(item?.status_integra),
    factory: textoOuNull(item?.factory),
    add_dias_status_fim: inteiroOuNull(item?.addDiasStatusFim),
    retorno_automatico: item?.retornoAutomatico === true
      ? 1
      : (item?.retornoAutomatico === false ? 0 : null),
    ultima_modificacao: parseDateTime(item?.ultimamodificacao),
    _evento_auto: mapStatusParaEvento(item?.status_integra || item?.descricao),
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

  // ── Fase 3 — Marcações de ponto e baixa ───────────────────────────────────

  async function carregarEmpresasExata(contaId, empresasExataIds) {
    const ids = Array.isArray(empresasExataIds)
      ? empresasExataIds.map(Number).filter(Number.isFinite)
      : [];

    const params = [contaId];
    let filtro = 'WHERE empresa_config_id = ? AND ativo = 1';
    if (ids.length > 0) {
      filtro += ' AND id IN (?)';
      params.push(ids);
    }

    const [rows] = await pool.query(
      `SELECT id, empresa_config_id, empresasistema, descricao, empresa_id
         FROM empresas_exata
         ${filtro}
         ORDER BY descricao ASC, empresasistema ASC`,
      params
    );
    return rows;
  }

  async function carregarEmpresasPorMatriculaExata(matriculas) {
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
        const key = matriculaToString(row.matricula);
        if (!porMatricula.has(key)) porMatricula.set(key, []);
        porMatricula.get(key).push({ id: row.empresa_id, nome: row.empresa });
      }
    }

    const resolvidas = new Map();
    for (const [matricula, empresas] of porMatricula) {
      const ids = new Set(empresas.map((item) => Number(item.id)));
      if (ids.size === 1) resolvidas.set(matricula, empresas[0]);
    }
    return resolvidas;
  }

  async function carregarChavesPontosExistentes(contaId, empresasistema, rows) {
    const existentes = new Set();
    const chave = (reppid, nsr) => `${reppid}:${nsr}`;

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const condicoes = chunk.map(() => '(reppid = ? AND nsr = ?)').join(' OR ');
      const params = [contaId, empresasistema];
      for (const row of chunk) params.push(row.reppid, row.nsr);

      const [found] = await pool.query(
        `SELECT reppid, nsr
           FROM marcacoes_ponto
          WHERE empresa_config_id = ? AND empresasistema = ? AND (${condicoes})`,
        params
      );
      for (const row of found) {
        existentes.add(chave(Number(row.reppid), Number(row.nsr)));
      }
    }

    return existentes;
  }

  async function persistirPontosExata(contaId, empresa, itens) {
    const stats = { buscados: 0, inseridos: 0, atualizados: 0, ignorados: 0, total: 0 };
    const unicos = new Map();

    for (const item of itens || []) {
      stats.buscados++;
      const row = normalizarPontoExata(
        item,
        contaId,
        empresa.empresasistema,
        empresa.empresa_id || null
      );
      if (!row) {
        stats.ignorados++;
        continue;
      }

      const chave = `${row.reppid}:${row.nsr}`;
      if (unicos.has(chave)) {
        stats.ignorados++;
        continue;
      }
      unicos.set(chave, row);
    }

    const rows = [...unicos.values()];
    if (rows.length === 0) return { ...stats, rows: [] };

    const empresasPorMatricula = await carregarEmpresasPorMatriculaExata(
      rows.map((row) => row.matricula)
    );
    for (const row of rows) {
      const local = empresasPorMatricula.get(row.matricula);
      if (local) row.empresa_id = local.id;
    }

    // Remove campos auxiliares antes de montar os valores do INSERT.
    const colunas = MARCACAO_EXATA_COLUNAS;
    const atualizaveis = colunas.filter(
      (coluna) => coluna !== 'empresa_config_id' && coluna !== 'empresasistema'
        && coluna !== 'reppid' && coluna !== 'nsr'
    );
    const sql = `
      INSERT INTO marcacoes_ponto (${colunas.join(', ')})
      VALUES ?
      ON DUPLICATE KEY UPDATE
        ${atualizaveis.map((coluna) => `${coluna} = VALUES(${coluna})`).join(', ')}
    `;

    const existentes = await carregarChavesPontosExistentes(
      contaId,
      empresa.empresasistema,
      rows
    );

    for (let i = 0; i < rows.length; i += MARCACOES_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + MARCACOES_CHUNK_SIZE);
      const values = chunk.map((row) => colunas.map((coluna) => row[coluna] ?? null));
      await pool.query(sql, [values]);
    }

    for (const row of rows) {
      if (existentes.has(`${row.reppid}:${row.nsr}`)) stats.atualizados++;
      else stats.inseridos++;
    }
    stats.total = stats.inseridos + stats.atualizados;

    return { ...stats, rows: rows.filter((row) => row._status === 'N') };
  }

  async function confirmarPontosExata(empresasistema, rows) {
    const unicos = new Map();
    for (const row of rows || []) {
      if (row._status !== 'N') continue;
      unicos.set(`${row.reppid}:${row.nsr}`, {
        empresa: empresasistema,
        nsr: row.nsr,
        reppid: row.reppid,
      });
    }

    const pontos = [...unicos.values()];
    const resultado = { total: pontos.length, confirmados: 0, erros: [] };
    if (pontos.length === 0) return resultado;

    const lote = 100;
    for (let i = 0; i < pontos.length; i += lote) {
      const chunk = pontos.slice(i, i + lote);
      try {
        await exataApi.confirmarPontos(chunk);
        resultado.confirmados += chunk.length;
      } catch (error) {
        resultado.erros.push(error?.message || String(error));
        break;
      }
    }

    return resultado;
  }

  async function marcarPontosExportados(contaId, empresasistema, rows) {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const condicoes = chunk.map(() => '(reppid = ? AND nsr = ?)').join(' OR ');
      const params = ['S', contaId, empresasistema];
      for (const row of chunk) params.push(row.reppid, row.nsr);
      await pool.query(
        `UPDATE marcacoes_ponto
            SET status_exportacao = ?
          WHERE empresa_config_id = ? AND empresasistema = ? AND (${condicoes})`,
        params
      );
    }
  }

  async function salvarEstadoPontosExata(contaId, empresasistema, {
    ultimaData,
    ultimoNsr = 0,
    ultimoReppid = null,
    ultimoTotal = 0,
  }) {
    await pool.query(
      `INSERT INTO marcacao_sync_estado_exata
         (empresa_config_id, empresasistema, ultima_data, ultimo_nsr, ultimo_reppid,
          ultima_execucao_em, ultimo_total)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         ultima_data = CASE
           WHEN VALUES(ultima_data) IS NULL THEN ultima_data
           WHEN ultima_data IS NULL OR VALUES(ultima_data) > ultima_data THEN VALUES(ultima_data)
           ELSE ultima_data
         END,
         ultimo_nsr = GREATEST(ultimo_nsr, VALUES(ultimo_nsr)),
         ultimo_reppid = COALESCE(VALUES(ultimo_reppid), ultimo_reppid),
         ultima_execucao_em = NOW(),
         ultimo_total = VALUES(ultimo_total)`,
      [
        contaId,
        empresasistema,
        ultimaData || null,
        Math.max(0, Number(ultimoNsr) || 0),
        ultimoReppid === null || ultimoReppid === undefined ? null : Number(ultimoReppid),
        Math.max(0, Number(ultimoTotal) || 0),
      ]
    );
  }

  async function lerEstadoPontosExata(contaId, empresasistema) {
    const [rows] = await pool.query(
      `SELECT ultima_data, ultimo_nsr, ultimo_reppid, ultima_execucao_em, ultimo_total
         FROM marcacao_sync_estado_exata
        WHERE empresa_config_id = ? AND empresasistema = ?`,
      [contaId, empresasistema]
    );
    return rows[0] || null;
  }

  function hojeIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function diasAtrasIso(dias) {
    const data = new Date();
    data.setUTCDate(data.getUTCDate() - dias);
    return data.toISOString().slice(0, 10);
  }

  /**
   * Importa os pontos de uma empresa Exata.
   * Cada página é persistida e só então confirmada via baixaponto671; se a
   * baixa falhar, os dados permanecem no banco e a próxima execução
   * reconsulta os mesmos pontos (upsert idempotente).
   */
  async function syncPontosEmpresa(conta, empresa, {
    modo,
    dataInicio,
    dataFim,
    qtde = 100,
  }) {
    const quantidade = Math.min(Math.max(Math.trunc(Number(qtde) || 100), 1), 1000);
    const stats = {
      dias: 0,
      paginas: 0,
      buscados: 0,
      inseridos: 0,
      atualizados: 0,
      ignorados: 0,
      baixados: 0,
      errosBaixa: 0,
      total: 0,
      ultimaData: null,
      ultimoNsr: 0,
      ultimoReppid: null,
    };

    let blocos;
    if (modo === 'periodo') {
      blocos = splitDiasExata(dataInicio, dataFim);
    } else {
      const estado = await lerEstadoPontosExata(conta.id, empresa.empresasistema);
      const inicio = dataInicio
        || dataParaIso(estado?.ultima_data)
        || diasAtrasIso(30);
      const fim = dataFim || hojeIso();
      blocos = splitDiasExata(inicio, fim);
    }
    stats.dias = blocos.length;

    for (const bloco of blocos) {
      let pagina = 0;
      const assinaturas = new Set();
      let interromper = false;

      while (pagina < 10000) {
        const itens = await exataApi.buscarPontos({
          empresa: empresa.empresasistema,
          qtde: quantidade,
          dtInicial: bloco.inicio,
          dtFinal: bloco.fim,
          status: 'N',
        });

        if (!Array.isArray(itens)) {
          throw new Error(
            `Resposta inválida de /pontos671 (empresa ${empresa.empresasistema}, ${bloco.inicio})`
          );
        }
        if (itens.length === 0) break;

        const assinatura = itens
          .map((item) => `${item?.reppid}:${item?.nsr}`)
          .sort()
          .join('|');
        if (assinaturas.has(assinatura)) {
          stats.errosBaixa++;
          stats.ultimoErro = 'A API retornou o mesmo lote duas vezes; importação interrompida para evitar laço';
          break;
        }
        assinaturas.add(assinatura);

        const persistido = await persistirPontosExata(conta.id, empresa, itens);
        stats.buscados += persistido.buscados;
        stats.inseridos += persistido.inseridos;
        stats.atualizados += persistido.atualizados;
        stats.ignorados += persistido.ignorados;
        stats.total += persistido.total;
        pagina++;

        for (const row of persistido.rows) {
          if (!stats.ultimaData || row.data_marcacao.slice(0, 10) > stats.ultimaData) {
            stats.ultimaData = row.data_marcacao.slice(0, 10);
          }
          if (row.nsr > stats.ultimoNsr) {
            stats.ultimoNsr = row.nsr;
            stats.ultimoReppid = row.reppid;
          }
        }

        const baixa = await confirmarPontosExata(empresa.empresasistema, persistido.rows);
        stats.baixados += baixa.confirmados;
        if (baixa.erros.length > 0) {
          stats.errosBaixa += baixa.erros.length;
          stats.ultimoErro = baixa.erros[0];
          interromper = true;
        } else if (persistido.rows.length > 0) {
          await marcarPontosExportados(conta.id, empresa.empresasistema, persistido.rows);
        }

        await salvarEstadoPontosExata(conta.id, empresa.empresasistema, {
          ultimaData: stats.ultimaData,
          ultimoNsr: stats.ultimoNsr,
          ultimoReppid: stats.ultimoReppid,
          ultimoTotal: stats.total,
        });

        if (interromper) break;
      }

      stats.paginas += pagina;
      if (interromper) break;
    }

    return stats;
  }

  async function sincronizarPontos({
    empresasExataIds,
    modo = 'incremental',
    dataInicio,
    dataFim,
    qtde = 100,
    usuario = null,
  } = {}) {
    await ensureSchema();
    const conta = await getContaExata();

    const modoNormalizado = modo === 'periodo' ? 'periodo' : 'incremental';
    if (modoNormalizado === 'periodo') {
      if (!dataInicio || !dataFim) {
        throw new Error('Informe dataInicio e dataFim para importar por período');
      }
      splitDiasExata(dataInicio, dataFim);
    }

    const empresas = await carregarEmpresasExata(conta.id, empresasExataIds);
    if (empresas.length === 0) {
      throw new Error('Nenhuma empresa Exata ativa encontrada para importar marcações');
    }

    const iniciadoEm = Date.now();
    const resultados = [];
    let totalComErro = 0;
    const totais = {
      buscados: 0,
      inseridos: 0,
      atualizados: 0,
      ignorados: 0,
      baixados: 0,
      erros: 0,
    };

    for (const empresa of empresas) {
      const resultado = {
        empresa_exata_id: empresa.id,
        empresasistema: empresa.empresasistema,
        descricao: empresa.descricao,
        empresa_id: empresa.empresa_id,
        empresa_nome: null,
        modo: modoNormalizado,
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
        dias: 0,
        paginas: 0,
        buscados: 0,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        baixados: 0,
        erros: 0,
        erro: null,
      };

      try {
        const stats = await syncPontosEmpresa(conta, empresa, {
          modo: modoNormalizado,
          dataInicio,
          dataFim,
          qtde,
        });

        Object.assign(resultado, {
          dias: stats.dias,
          paginas: stats.paginas,
          buscados: stats.buscados,
          inseridos: stats.inseridos,
          atualizados: stats.atualizados,
          ignorados: stats.ignorados,
          baixados: stats.baixados,
          erros: stats.errosBaixa,
          erro: stats.ultimoErro || null,
        });

        totais.buscados += stats.buscados;
        totais.inseridos += stats.inseridos;
        totais.atualizados += stats.atualizados;
        totais.ignorados += stats.ignorados;
        totais.baixados += stats.baixados;
        totais.erros += stats.errosBaixa;

        if (stats.errosBaixa > 0) totalComErro++;
      } catch (error) {
        totalComErro++;
        resultado.erro = error?.message || String(error);
        console.error(`[Exata] Pontos da empresa ${empresa.empresasistema}:`, resultado.erro);
      }

      resultados.push(resultado);
    }

    const duracaoMs = Date.now() - iniciadoEm;
    const status = totalComErro === 0
      ? 'CONCLUIDO'
      : (totalComErro === empresas.length ? 'ERRO' : 'PARCIAL');
    const tipo = modoNormalizado === 'periodo'
      ? 'EXATA_PONTOS_PERIODO'
      : 'EXATA_PONTOS_INCREMENTAL';

    const execucaoId = await registrarExecucao({
      tipo,
      status,
      usuario,
      iniciadoEm,
      duracaoMs,
      empresasProcessadas: resultados.length,
      resumo: { modo: modoNormalizado, dataInicio: dataInicio || null, dataFim: dataFim || null, qtde: Number(qtde) || 100, ...totais, empresas: resultados },
      erro: totalComErro > 0
        ? resultados.filter((r) => r.erro).map((r) => `${r.descricao || r.empresasistema}: ${r.erro}`).join('; ')
        : null,
    });

    return {
      success: totalComErro === 0,
      execucaoId,
      status,
      modo: modoNormalizado,
      duracaoMs,
      ...totais,
      empresas: resultados,
    };
  }

  async function listarPontosStatus() {
    await ensureSchema();
    const conta = await getContaExata();

    const [empresas] = await pool.query(
      `SELECT ee.id, ee.empresasistema, ee.descricao, ee.empresa_id, ee.ativo,
              e.nome AS empresa_nome,
              DATE_FORMAT(st.ultima_data, '%Y-%m-%d') AS ultima_data,
              st.ultimo_nsr, st.ultimo_reppid,
              DATE_FORMAT(st.ultima_execucao_em, '%Y-%m-%d %H:%i:%s') AS ultima_execucao_em,
              st.ultimo_total,
              (SELECT COUNT(*)
                 FROM marcacoes_ponto mp
                WHERE mp.empresa_config_id = ee.empresa_config_id
                  AND mp.empresasistema = ee.empresasistema) AS total_marcacoes,
              (SELECT MAX(mp.data_marcacao)
                 FROM marcacoes_ponto mp
                WHERE mp.empresa_config_id = ee.empresa_config_id
                  AND mp.empresasistema = ee.empresasistema) AS ultima_marcacao
         FROM empresas_exata ee
         LEFT JOIN empresas e ON e.id = ee.empresa_id
         LEFT JOIN marcacao_sync_estado_exata st
           ON st.empresa_config_id = ee.empresa_config_id
          AND st.empresasistema = ee.empresasistema
        WHERE ee.empresa_config_id = ?
        ORDER BY ee.descricao ASC, ee.empresasistema ASC`,
      [conta.id]
    );

    const resumo = empresas.reduce((acc, item) => {
      acc.total += 1;
      acc.marcacoes += Number(item.total_marcacoes) || 0;
      if (Number(item.ativo)) acc.ativas += 1;
      return acc;
    }, { total: 0, ativas: 0, marcacoes: 0 });

    return { success: true, conta, empresas, resumo };
  }

  // ── Fase 4 — Status de funcionários (somente leitura) ─────────────────────

  async function carregarCatalogoStatus(contaId, empresasistema) {
    const [rows] = await pool.query(
      `SELECT id, empresa_config_id, empresasistema, status_id, descricao,
              ponto_liberado, ativo, status_integra, factory, add_dias_status_fim,
              retorno_automatico, ultima_modificacao, evento_local, mapeamento_manual,
              sincronizado_em
         FROM status_funcionario_exata
        WHERE empresa_config_id = ? AND empresasistema = ?
        ORDER BY descricao ASC, status_id ASC`,
      [contaId, empresasistema]
    );
    return rows;
  }

  async function aplicarStatusNosEventos(conta, empresa, statusRows) {
    const porIntegra = new Map();
    const porDescricao = new Map();
    for (const row of statusRows) {
      if (row.status_integra) {
        porIntegra.set(normalizeTexto(row.status_integra), row);
      }
      if (row.descricao) {
        porDescricao.set(normalizeTexto(row.descricao), row);
      }
    }

    const [funcionarios] = await pool.query(
      `SELECT matricula, status, status_inicio, status_fim
         FROM funcionario_exata
        WHERE empresa_config_id = ? AND empresasistema = ?
          AND status IS NOT NULL AND status_inicio IS NOT NULL`,
      [conta.id, empresa.empresasistema]
    );

    const stats = { analisados: 0, criados: 0, atualizados: 0, removidos: 0, semMapeamento: 0 };

    for (const funcionario of funcionarios) {
      stats.analisados++;
      const matricula = matriculaToString(funcionario.matricula);
      if (!matricula) continue;

      const chave = normalizeTexto(funcionario.status);
      const catalogo = porIntegra.get(chave) || porDescricao.get(chave) || null;
      const tipo = catalogo?.evento_local
        || mapStatusParaEvento(catalogo?.status_integra || catalogo?.descricao || funcionario.status);
      const chaveExterna = `exata:${conta.id}:${empresa.empresasistema}:${matricula}`;

      if (!tipo) {
        const [result] = await pool.query(
          'DELETE FROM evento_funcionario WHERE chave_externa = ?',
          [chaveExterna]
        );
        if (result.affectedRows > 0) stats.removidos += result.affectedRows;
        continue;
      }

      const dataInicio = dataParaIso(funcionario.status_inicio);
      if (!dataInicio) {
        stats.semMapeamento++;
        continue;
      }
      const dataFim = dataParaIso(funcionario.status_fim) || '2099-12-31';

      const [existentes] = await pool.query(
        'SELECT id FROM evento_funcionario WHERE chave_externa = ? LIMIT 1',
        [chaveExterna]
      );

      await pool.query(
        `INSERT INTO evento_funcionario
           (matricula_funcionario, data_inicio, data_fim, tipo_evento, detalhes,
            categoria, criado_por, chave_externa, origem)
         VALUES (?, ?, ?, ?, ?, 'PERIODO', 'ExataWeb', ?, 'exata')
         ON DUPLICATE KEY UPDATE
           data_inicio = VALUES(data_inicio),
           data_fim = VALUES(data_fim),
           tipo_evento = VALUES(tipo_evento),
           detalhes = VALUES(detalhes),
           origem = 'exata'`,
        [
          matricula,
          dataInicio,
          dataFim,
          tipo,
          catalogo?.descricao || funcionario.status || '',
          chaveExterna,
        ]
      );

      if (existentes.length > 0) stats.atualizados++;
      else stats.criados++;
    }

    return stats;
  }

  async function sincronizarStatusFuncionarios({ empresasExataIds, usuario = null } = {}) {
    await ensureSchema();
    const conta = await getContaExata();
    const empresas = await carregarEmpresasExata(conta.id, empresasExataIds);
    if (empresas.length === 0) {
      throw new Error('Nenhuma empresa Exata ativa encontrada para sincronizar status');
    }

    const iniciadoEm = Date.now();
    const resultados = [];
    let totalComErro = 0;
    const totais = {
      recebidos: 0,
      inseridos: 0,
      atualizados: 0,
      ignorados: 0,
      eventosCriados: 0,
      eventosAtualizados: 0,
      eventosRemovidos: 0,
      semMapeamento: 0,
    };

    for (const empresa of empresas) {
      const resultado = {
        empresa_exata_id: empresa.id,
        empresasistema: empresa.empresasistema,
        descricao: empresa.descricao,
        recebidos: 0,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        eventos_criados: 0,
        eventos_atualizados: 0,
        eventos_removidos: 0,
        sem_mapeamento: 0,
        erro: null,
      };

      try {
        const resposta = await exataApi.listarStatusFuncionarios(empresa.empresasistema);
        if (!Array.isArray(resposta)) {
          throw new Error(
            `Resposta inválida de /status_funcionarios (empresa ${empresa.empresasistema})`
          );
        }

        const unicos = new Map();
        let ignorados = 0;
        for (const item of resposta) {
          const row = normalizarStatusExata(item, conta.id, empresa.empresasistema);
          if (!row || unicos.has(row.status_id)) {
            ignorados++;
            continue;
          }
          unicos.set(row.status_id, row);
        }

        const [existentes] = await pool.query(
          `SELECT status_id FROM status_funcionario_exata
            WHERE empresa_config_id = ? AND empresasistema = ?`,
          [conta.id, empresa.empresasistema]
        );
        const idsExistentes = new Set(existentes.map((row) => Number(row.status_id)));

        for (const row of unicos.values()) {
          await pool.query(
            `INSERT INTO status_funcionario_exata
               (empresa_config_id, empresasistema, status_id, descricao, ponto_liberado,
                ativo, status_integra, factory, add_dias_status_fim, retorno_automatico,
                ultima_modificacao, evento_local, mapeamento_manual, sincronizado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())
             ON DUPLICATE KEY UPDATE
               descricao = VALUES(descricao),
               ponto_liberado = VALUES(ponto_liberado),
               ativo = VALUES(ativo),
               status_integra = VALUES(status_integra),
               factory = VALUES(factory),
               add_dias_status_fim = VALUES(add_dias_status_fim),
               retorno_automatico = VALUES(retorno_automatico),
               ultima_modificacao = VALUES(ultima_modificacao),
               evento_local = IF(mapeamento_manual = 1, evento_local, VALUES(evento_local)),
               sincronizado_em = NOW()`,
            [
              row.empresa_config_id,
              row.empresasistema,
              row.status_id,
              row.descricao,
              row.ponto_liberado,
              row.ativo,
              row.status_integra,
              row.factory,
              row.add_dias_status_fim,
              row.retorno_automatico,
              row.ultima_modificacao,
              row._evento_auto,
            ]
          );
        }

        const catalogo = await carregarCatalogoStatus(conta.id, empresa.empresasistema);
        const eventos = await aplicarStatusNosEventos(conta, empresa, catalogo);

        resultado.recebidos = resposta.length;
        resultado.inseridos = [...unicos.keys()].filter((id) => !idsExistentes.has(id)).length;
        resultado.atualizados = unicos.size - resultado.inseridos;
        resultado.ignorados = ignorados;
        resultado.eventos_criados = eventos.criados;
        resultado.eventos_atualizados = eventos.atualizados;
        resultado.eventos_removidos = eventos.removidos;
        resultado.sem_mapeamento = eventos.semMapeamento;

        totais.recebidos += resposta.length;
        totais.inseridos += resultado.inseridos;
        totais.atualizados += resultado.atualizados;
        totais.ignorados += ignorados;
        totais.eventosCriados += eventos.criados;
        totais.eventosAtualizados += eventos.atualizados;
        totais.eventosRemovidos += eventos.removidos;
        totais.semMapeamento += eventos.semMapeamento;
      } catch (error) {
        totalComErro++;
        resultado.erro = error?.message || String(error);
        console.error(`[Exata] Status da empresa ${empresa.empresasistema}:`, resultado.erro);
      }

      resultados.push(resultado);
    }

    const duracaoMs = Date.now() - iniciadoEm;
    const status = totalComErro === 0
      ? 'CONCLUIDO'
      : (totalComErro === empresas.length ? 'ERRO' : 'PARCIAL');

    const execucaoId = await registrarExecucao({
      tipo: 'EXATA_STATUS_FUNCIONARIOS',
      status,
      usuario,
      iniciadoEm,
      duracaoMs,
      empresasProcessadas: resultados.length,
      resumo: { ...totais, empresas: resultados },
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

  async function listarStatusFuncionarios() {
    await ensureSchema();
    const conta = await getContaExata();
    const [empresas] = await pool.query(
      `SELECT ee.id, ee.empresasistema, ee.descricao, ee.empresa_id, ee.ativo,
              e.nome AS empresa_nome
         FROM empresas_exata ee
         LEFT JOIN empresas e ON e.id = ee.empresa_id
        WHERE ee.empresa_config_id = ?
        ORDER BY ee.descricao ASC, ee.empresasistema ASC`,
      [conta.id]
    );

    const resultado = [];
    for (const empresa of empresas) {
      const statuses = await carregarCatalogoStatus(conta.id, empresa.empresasistema);
      resultado.push({
        ...empresa,
        statuses,
        eventos_mapeados: statuses.filter((item) => !!item.evento_local).length,
      });
    }

    return {
      success: true,
      conta,
      empresas: resultado,
      eventosDisponiveis: EVENTOS_LOCAIS,
    };
  }

  async function atualizarStatusExata(id, { evento_local } = {}) {
    await ensureSchema();
    const conta = await getContaExata();
    const statusId = Number(id);
    if (!Number.isFinite(statusId)) throw new Error('Status Exata inválido');

    const [rows] = await pool.query(
      `SELECT id, empresa_config_id, empresasistema
         FROM status_funcionario_exata
        WHERE id = ? AND empresa_config_id = ?
        LIMIT 1`,
      [statusId, conta.id]
    );
    if (rows.length === 0) throw new Error('Status Exata não encontrado');

    const evento = textoOuNull(evento_local);
    await pool.query(
      `UPDATE status_funcionario_exata
          SET evento_local = ?, mapeamento_manual = 1
        WHERE id = ? AND empresa_config_id = ?`,
      [evento, statusId, conta.id]
    );

    const empresa = rows[0];
    const [empresas] = await pool.query(
      `SELECT id, empresa_config_id, empresasistema, descricao, empresa_id
         FROM empresas_exata
        WHERE empresa_config_id = ? AND empresasistema = ?
        LIMIT 1`,
      [conta.id, empresa.empresasistema]
    );
    if (empresas[0]) {
      const catalogo = await carregarCatalogoStatus(conta.id, empresa.empresasistema);
      await aplicarStatusNosEventos(conta, empresas[0], catalogo);
    }

    const [updated] = await pool.query(
      `SELECT id, empresa_config_id, empresasistema, status_id, descricao,
              ponto_liberado, ativo, status_integra, evento_local, mapeamento_manual
         FROM status_funcionario_exata
        WHERE id = ?`,
      [statusId]
    );
    return updated[0];
  }

  return {
    ensureSchema,
    getContaExata,
    listarEmpresasExata,
    sincronizarEmpresas,
    atualizarEmpresaExata,
    sincronizarFuncionarios,
    // Fase 3 — marcações e baixa
    sincronizarPontos,
    listarPontosStatus,
    // Fase 4 — status de funcionários (leitura)
    sincronizarStatusFuncionarios,
    listarStatusFuncionarios,
    atualizarStatusExata,
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
  normalizarPontoExata,
  normalizarStatusExata,
  mapStatusParaEvento,
  montarDataHoraExata,
  splitDiasExata,
  parseDateOnly,
  parseDateTime,
  encontrarEmpresaLocal,
  matriculaToString,
  EVENTOS_LOCAIS,
};
