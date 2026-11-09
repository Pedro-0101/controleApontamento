'use strict';

/**
 * Leitura unificada das marcações de ponto locais.
 *
 * Todas as importações (Ponto Certificado / Stefanini e ExataWeb) são gravadas
 * na mesma tabela `marcacoes_ponto`. Este módulo expõe uma consulta única que
 * ignora provedor, empresa da API e mapeamentos: o painel e os relatórios veem
 * todos os pontos de todos os funcionários, independentemente da origem.
 */

const MAX_REGISTROS = 200000;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatYMD(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function parsePeriodo(dataInicio, dataFim) {
  const inicio = parseDate(dataInicio);
  const fim = parseDate(dataFim);

  if (!inicio || !fim) {
    throw new Error('Informe o período no formato AAAA-MM-DD ou DD/MM/AAAA');
  }
  if (fim < inicio) {
    throw new Error('A data final deve ser maior ou igual à data inicial');
  }

  const fimExclusivo = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() + 1);

  return {
    inicio: `${formatYMD(inicio)} 00:00:00`,
    fimExclusivo: `${formatYMD(fimExclusivo)} 00:00:00`,
  };
}

function normalizarNumSerie(value) {
  return String(value ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(/^0+/, '');
}

/**
 * Consulta as marcações locais do período. Não filtra por provedor nem por
 * conta de API; os filtros opcionais são apenas funcionário e relógio.
 */
async function consultarMarcacoesLocais(pool, filtros = {}) {
  const periodo = parsePeriodo(filtros.dataInicio, filtros.dataFim);
  const where = ['mp.data_marcacao >= ?', 'mp.data_marcacao < ?'];
  const params = [periodo.inicio, periodo.fimExclusivo];

  const matricula = String(filtros.matriculaFuncionario ?? '').trim();
  if (matricula) {
    where.push('mp.matricula = ?');
    params.push(matricula);
  }

  const numSerie = normalizarNumSerie(filtros.numSerieRelogio);
  if (numSerie) {
    where.push("TRIM(LEADING '0' FROM REPLACE(mp.num_serie_relogio, '.', '')) = ?");
    params.push(numSerie);
  }

  const [rows] = await pool.query(
    `SELECT mp.id, mp.empresa_config_id, mp.empresa_id, mp.marcacao_id, mp.nsr,
            mp.data_marcacao, mp.data_insercao, mp.matricula, mp.cpf, mp.pis,
            mp.trabalhador_id, mp.num_serie_relogio, mp.tipo_registro,
            mp.id_local, mp.nome_local, mp.descricao_local, mp.codigo_unidade,
            mp.gps_latitude, mp.gps_longitude, mp.flag_fora_cerca,
            mp.atividade, mp.provedor, mp.empresasistema
       FROM marcacoes_ponto mp
      WHERE ${where.join(' AND ')}
      ORDER BY mp.data_marcacao ASC, mp.id ASC
      LIMIT ${MAX_REGISTROS}`,
    params
  );

  return rows;
}

/**
 * Converte a linha local para o formato que o painel/relatórios consomem.
 */
function toMarcacaoDto(row) {
  return {
    id: row.marcacao_id ?? row.id,
    marcacao_id: row.marcacao_id,
    matricula: row.matricula,
    cpf: row.cpf || '',
    pis: row.pis || '',
    data_marcacao: row.data_marcacao,
    data_insercao: row.data_insercao,
    nsr: row.nsr ?? 0,
    num_serie_relogio: row.num_serie_relogio || '',
    tipo_registro: row.tipo_registro ?? 0,
    id_local: row.id_local ?? 0,
    nome_local: row.nome_local ?? null,
    descricao_local: row.descricao_local ?? null,
    codigo_unidade: row.codigo_unidade || '',
    gps_latitude: row.gps_latitude || '0',
    gps_longitude: row.gps_longitude || '0',
    flag_fora_cerca: Number(row.flag_fora_cerca) === 1,
    atividade: row.atividade || '',
    trabalhador_id: row.trabalhador_id ?? 0,
    provedor: row.provedor || '',
    empresasistema: row.empresasistema ?? null,
  };
}

function createMarcacoesLocais({ pool }) {
  async function consultar(filtros) {
    const rows = await consultarMarcacoesLocais(pool, filtros);
    return rows.map(toMarcacaoDto);
  }

  return { consultar };
}

module.exports = {
  createMarcacoesLocais,
  consultarMarcacoesLocais,
  toMarcacaoDto,
  parsePeriodo,
  parseDate,
  normalizarNumSerie,
};
