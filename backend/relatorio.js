'use strict';

/**
 * Cálculo dos relatórios agendados (faltas, atrasos, etc).
 *
 * A regra de status replica a lógica do frontend (MarcacaoDia.getStatus) para
 * que o resultado enviado por WhatsApp seja idêntico ao exibido no sistema.
 */

const API_BASE = 'https://integrar.pontocertificado.com.br/Api.svc';
const ERROS_API = ['desativada', 'contate o suporte', 'não encontrada', 'inválido', 'inválida', 'expirado'];

const AFASTAMENTO_EVENTOS = [
  'Ferias', 'Atestado', 'Afastado', 'Suspensao', 'Folga',
  'Feriado', 'Licença Maternidade/ Paternidade', 'Licença Nojo',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatYMD(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYMD(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(str, days) {
  const d = parseYMD(str);
  if (!d) return str;
  d.setDate(d.getDate() + days);
  return formatYMD(d);
}

function sameYMD(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDDMMYYYY(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function parseApiDate(dateStr) {
  if (!dateStr) return null;
  try {
    const s = String(dateStr);
    if (s.startsWith('/Date(')) {
      const ts = s.match(/\d+/);
      return ts ? new Date(parseInt(ts[0], 10)) : null;
    }
    const [datePart, timePart = '00:00:00'] = s.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hh, mm, ss] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hh || 0, mm || 0, ss || 0);
  } catch {
    return null;
  }
}

function workedMinutes(marks) {
  if (marks.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < marks.length - 1; i += 2) {
    const diff = marks[i + 1].dataMarcacao.getTime() - marks[i].dataMarcacao.getTime();
    if (diff > 0) total += diff;
  }
  return Math.floor(total / 60000);
}

/**
 * Mesma regra de MarcacaoDia.getStatus() do frontend.
 */
function computeStatus({ dataStr, trabalhaSabado, batePonto, marks, evento }) {
  const dataObj = parseYMD(dataStr);
  if (!dataObj) return 'Pendente';

  const diaSemana = dataObj.getDay();
  const num = marks.length;
  const minutos = workedMinutes(marks);
  const horas = minutos / 60;

  let isIncompleto = false;
  const hoje = new Date();
  const isHoje = sameYMD(dataObj, hoje);
  const isEmAndamento = isHoje && diaSemana !== 0 && num >= 1;

  if (num > 0 && !isEmAndamento) {
    if (num % 2 !== 0) {
      isIncompleto = true;
    } else if (diaSemana === 6) {
      const validPunchCount = num === 2 || num === 4;
      const overMax = num === 2 && horas > 6;
      if (!validPunchCount || overMax) isIncompleto = true;
    } else if (diaSemana !== 0) {
      if (num < 4) isIncompleto = true;
    }
  }

  if (batePonto === false && num === 0) return 'Não bate ponto';

  const evtStr = evento ? String(evento).trim() : null;
  if (evtStr === 'Feriado' && isIncompleto) return 'Incompleto';
  if (evtStr) return evtStr;

  if (isEmAndamento) return 'Em andamento';
  if (isIncompleto) return 'Incompleto';

  if (num > 0) {
    if (diaSemana === 0) return 'Ok';
    if (diaSemana === 6) return minutos >= (4 * 60 - 5) ? 'Ok' : 'Atraso';
    return minutos >= (8 * 60 - 5) ? 'Ok' : 'Atraso';
  }

  if (diaSemana === 0) return 'Ok';
  if (diaSemana === 6 && !trabalhaSabado) return 'Ok';
  return 'Falta';
}

async function getActiveTokens(pool) {
  const [companies] = await pool.query(
    'SELECT id, nome, email, senha, chave FROM empresas_config WHERE ativo = 1'
  );
  const tokens = await Promise.all(companies.map(async (c) => {
    try {
      const r = await fetch(`${API_BASE}/StartSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chaveEmpresa: c.chave, usuario: c.email, senha: c.senha }),
      });
      const data = await r.json();
      const raw = data?.d ?? null;
      const isErro = raw && ERROS_API.some((k) => String(raw).toLowerCase().includes(k));
      return isErro ? null : raw;
    } catch {
      return null;
    }
  }));
  return tokens.filter(Boolean);
}

async function fetchMarcacoes(token, dataInicio, dataFim) {
  try {
    const r = await fetch(`${API_BASE}/SelecionaMarcacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenAcesso: token, dataInicio, dataFim }),
    });
    const data = await r.json();
    const arr = data?.d?.results || data?.d || data;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function getEmployees(pool, { empresa_id, local_id }) {
  let query = `
    SELECT q.matricula, q.nome, q.trabalha_sabado, q.bate_ponto, q.data_admissao,
           COALESCE(e.nome, q.empresa, '') AS empresa,
           COALESCE(l.nome, q.\`local\`, '') AS \`local\`
    FROM qrcod_2023 q
    LEFT JOIN empresas e ON q.empresa_id = e.id
    LEFT JOIN locais   l ON q.local_id   = l.id
    WHERE q.ativo = 1
  `;
  const params = [];
  if (empresa_id) {
    query += ' AND q.empresa_id = ?';
    params.push(empresa_id);
  }
  if (local_id) {
    query += ' AND q.local_id = ?';
    params.push(local_id);
  }
  const [rows] = await pool.query(query, params);
  return rows;
}

function buildIgnoredSets(ignoredRows) {
  const manualIds = new Set();
  const autoKeys = new Set();
  const autoRelogioHora = new Set();
  for (const p of ignoredRows) {
    if (p.marcacao_id) {
      manualIds.add(Number(p.marcacao_id));
    } else {
      const nsr = p.nsr != null ? String(p.nsr) : '';
      const relogio = p.relogio_ns != null ? String(p.relogio_ns) : '';
      autoKeys.add(`${nsr}|${relogio}`);
      if (p.hora) autoRelogioHora.add(`${relogio}|${String(p.hora)}`);
    }
  }
  return { manualIds, autoKeys, autoRelogioHora };
}

function isIgnored(mark, ignored) {
  if (mark.numSerieRelogio === 'MANUAL') {
    return ignored.manualIds.has(Number(mark.id));
  }
  const nsr = mark.nsr != null ? String(mark.nsr) : '';
  const relogio = mark.numSerieRelogio != null ? String(mark.numSerieRelogio) : '';
  if (ignored.autoKeys.has(`${nsr}|${relogio}`)) return true;
  const hora = `${pad(mark.dataMarcacao.getHours())}:${pad(mark.dataMarcacao.getMinutes())}:${pad(mark.dataMarcacao.getSeconds())}`;
  return ignored.autoRelogioHora.has(`${relogio}|${hora}`);
}

/**
 * Monta o relatório de um dia para um agendamento.
 * Retorna { data, total, itens: [{ matricula, nome, empresa, local, status, horarios }] }
 */
async function buildReport(pool, schedule, dataStr) {
  const statusFiltro = Array.isArray(schedule.status) ? schedule.status : [];
  const empresaId = schedule.empresa_id || null;
  const localId = schedule.local_id || null;

  const employees = await getEmployees(pool, { empresa_id: empresaId, local_id: localId });
  if (employees.length === 0) {
    return { data: dataStr, total: 0, itens: [] };
  }

  const matriculas = employees.map((e) => String(e.matricula).trim());
  const placeholders = matriculas.map(() => '?').join(',');

  // Marcações automáticas da API externa (inclui madrugada do dia seguinte)
  const tokens = await getActiveTokens(pool);
  const dataInicioApi = `${formatDDMMYYYY(parseYMD(dataStr))} 00:00:00`;
  const dataFimApi = `${formatDDMMYYYY(parseYMD(addDays(dataStr, 1)))} 03:59:59`;
  const rawAll = (await Promise.all(tokens.map((t) => fetchMarcacoes(t, dataInicioApi, dataFimApi)))).flat();

  const marksByMatricula = new Map();
  for (const raw of rawAll) {
    const matricula = String(raw.MatriculaFuncionario || '').trim();
    if (!matricula) continue;
    const dt = parseApiDate(raw.DataMarcacao);
    if (!dt) continue;
    const logical = new Date(dt);
    if (logical.getHours() < 4) logical.setDate(logical.getDate() - 1);
    if (formatYMD(logical) !== dataStr) continue;
    if (!marksByMatricula.has(matricula)) marksByMatricula.set(matricula, []);
    marksByMatricula.get(matricula).push({
      id: raw.Id || raw.id || 0,
      nsr: raw.NSR != null ? raw.NSR : 0,
      numSerieRelogio: String(raw.NumSerieRelogio || ''),
      dataMarcacao: dt,
    });
  }

  // Pontos manuais (dia + madrugada do dia seguinte)
  const [manualRows] = await pool.query(
    `SELECT id, matricula_funcionario, DATE_FORMAT(data, '%Y-%m-%d') AS data,
            TIME_FORMAT(hora, '%H:%i:%s') AS hora
     FROM ponto_manual
     WHERE matricula_funcionario IN (${placeholders}) AND data IN (?, ?)`,
    [...matriculas, dataStr, addDays(dataStr, 1)]
  );
  for (const p of manualRows) {
    const [hh, mm, ss] = String(p.hora).split(':').map(Number);
    const dt = parseYMD(p.data);
    dt.setHours(hh || 0, mm || 0, ss || 0);
    const logical = new Date(dt);
    if (hh < 5) logical.setDate(logical.getDate() - 1);
    if (formatYMD(logical) !== dataStr) continue;
    const matricula = String(p.matricula_funcionario).trim();
    if (!marksByMatricula.has(matricula)) marksByMatricula.set(matricula, []);
    marksByMatricula.get(matricula).push({
      id: p.id,
      nsr: null,
      numSerieRelogio: 'MANUAL',
      dataMarcacao: dt,
    });
  }

  // Pontos desconsiderados
  const [ignoredRows] = await pool.query(
    `SELECT matricula_funcionario, DATE_FORMAT(data, '%Y-%m-%d') AS data,
            marcacao_id, nsr, relogio_ns, TIME_FORMAT(hora, '%H:%i:%s') AS hora
     FROM marcacao_desconsiderada
     WHERE matricula_funcionario IN (${placeholders}) AND data IN (?, ?)`,
    [...matriculas, dataStr, addDays(dataStr, 1)]
  );
  const ignoredByMatricula = new Map();
  for (const p of ignoredRows) {
    const m = String(p.matricula_funcionario).trim();
    if (!ignoredByMatricula.has(m)) ignoredByMatricula.set(m, []);
    ignoredByMatricula.get(m).push(p);
  }

  // Eventos (status fixos/período) que cobrem a data
  const [eventRows] = await pool.query(
    `SELECT id, matricula_funcionario, DATE_FORMAT(data_inicio, '%Y-%m-%d') AS data_inicio,
            DATE_FORMAT(data_fim, '%Y-%m-%d') AS data_fim, tipo_evento
     FROM evento_funcionario
     WHERE matricula_funcionario IN (${placeholders})
       AND (data_inicio <= ? AND data_fim >= ?)
     ORDER BY id DESC`,
    [...matriculas, dataStr, dataStr]
  );
  const eventByMatricula = new Map();
  for (const e of eventRows) {
    const m = String(e.matricula_funcionario).trim();
    if (!eventByMatricula.has(m)) eventByMatricula.set(m, e.tipo_evento);
  }

  const itens = [];
  for (const emp of employees) {
    const matricula = String(emp.matricula).trim();

    if (emp.data_admissao) {
      const adm = emp.data_admissao instanceof Date ? formatYMD(emp.data_admissao) : String(emp.data_admissao).substring(0, 10);
      if (dataStr < adm) continue;
    }

    const ignored = buildIgnoredSets(ignoredByMatricula.get(matricula) || []);
    const marks = (marksByMatricula.get(matricula) || [])
      .filter((m) => !isIgnored(m, ignored))
      .sort((a, b) => a.dataMarcacao.getTime() - b.dataMarcacao.getTime());

    const status = computeStatus({
      dataStr,
      trabalhaSabado: emp.trabalha_sabado === 1 || emp.trabalha_sabado === true,
      batePonto: !(emp.bate_ponto === 0 || emp.bate_ponto === false),
      marks,
      evento: eventByMatricula.get(matricula) || null,
    });

    if (statusFiltro.length > 0 && !statusFiltro.includes(status)) continue;

    itens.push({
      matricula,
      nome: emp.nome,
      empresa: emp.empresa || '',
      local: emp.local || '',
      status,
      horarios: marks.map((m) => `${pad(m.dataMarcacao.getHours())}:${pad(m.dataMarcacao.getMinutes())}`),
    });
  }

  itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { data: dataStr, total: itens.length, itens };
}

const DIAS_SEMANA_NOME = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function buildMessage(schedule, report) {
  const dataObj = parseYMD(report.data);
  const dataFmt = `${pad(dataObj.getDate())}/${pad(dataObj.getMonth() + 1)}/${dataObj.getFullYear()}`;
  const diaNome = DIAS_SEMANA_NOME[dataObj.getDay()];

  const linhas = [];
  linhas.push(`*${schedule.nome || 'Relatório'}*`);
  linhas.push(`Data: ${dataFmt} (${diaNome})`);
  if (schedule.local_nome) linhas.push(`Local: ${schedule.local_nome}`);
  if (schedule.empresa_nome) linhas.push(`Empresa: ${schedule.empresa_nome}`);
  linhas.push(`Total: ${report.total} colaborador(es)`);
  linhas.push('');

  if (report.total === 0) {
    linhas.push('Nenhum colaborador encontrado para os filtros.');
  } else {
    for (const item of report.itens) {
      const horarios = item.horarios.length ? ` — ${item.horarios.join(' ')}` : '';
      linhas.push(`• ${item.nome} (mat. ${item.matricula}) — ${item.status}${horarios}`);
    }
  }

  linhas.push('');
  linhas.push('_Enviado automaticamente pelo sistema de apontamento._');
  return linhas.join('\n');
}

module.exports = {
  buildReport,
  buildMessage,
  computeStatus,
  formatYMD,
  addDays,
  parseYMD,
};
