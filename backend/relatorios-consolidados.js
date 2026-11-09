'use strict';

/**
 * Fase 5 — Relatórios consolidados multiempresa.
 *
 * Consulta as marcações já importadas em `marcacoes_ponto` (Fase 3) e
 * consolida os dados de várias empresas em uma única visão, com filtros por
 * período, empresa local, empresa da API, funcionário, relógio e local.
 *
 * Exportações suportadas (sem dependências externas):
 *  - CSV  — separador `;`, UTF-8 com BOM (abre corretamente no Excel brasileiro).
 *  - XLS  — tabela HTML com extensão `.xls` (compatível com Excel/LibreOffice).
 *  - PDF  — relatório tabular A4 paisagem gerado com fontes base do PDF.
 */

const MAX_REGISTROS = 50000;
const CHUNK_SIZE = 500;

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
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
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
    inicioLabel: formatYMD(inicio),
    fimLabel: formatYMD(fim),
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

function toNumberArray(value) {
  return toArray(value).map(Number).filter(Number.isFinite);
}

function normalizeNumSerie(value) {
  return String(value ?? '').trim().replace(/\./g, '').replace(/^0+/, '');
}

function normalizeTexto(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function chunk(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function dateKey(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return formatYMD(date);
}

const TIPO_REGISTRO_LABEL = {
  1: 'Entrada',
  2: 'Saída',
  3: 'Intervalo',
  4: 'Volta intervalo',
  5: 'Entrada',
  6: 'Saída',
};

function tipoRegistroLabel(value) {
  const numero = Number(value);
  return TIPO_REGISTRO_LABEL[numero] || (Number.isFinite(numero) ? String(numero) : '—');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[";\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pdfEscape(value) {
  return String(value ?? '')
    .replace(/[^\x00-\xFF]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function truncate(value, max) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

const PDF_COLUNAS = [
  { titulo: 'Data', x: 20, largura: 44, maxChars: 10, campo: (r) => formatDate(r.data_marcacao) },
  { titulo: 'Hora', x: 64, largura: 38, maxChars: 8, campo: (r) => formatTime(r.data_marcacao) },
  { titulo: 'Matrícula', x: 102, largura: 62, maxChars: 12, campo: (r) => r.matricula },
  { titulo: 'Funcionário', x: 164, largura: 186, maxChars: 36, campo: (r) => r.funcionario_nome || '—' },
  { titulo: 'Empresa', x: 350, largura: 138, maxChars: 26, campo: (r) => r.empresa_nome || '—' },
  { titulo: 'Relógio', x: 488, largura: 96, maxChars: 18, campo: (r) => r.relogio_descricao || r.num_serie_relogio || '—' },
  { titulo: 'NSR', x: 584, largura: 46, maxChars: 8, campo: (r) => r.nsr ?? '' },
  { titulo: 'Local', x: 630, largura: 192, maxChars: 32, campo: (r) => r.local || '—' },
];

function buildPdf({ titulo, subtotal, filtros, rows }) {
  const pageWidth = 842;
  const pageHeight = 595;
  const rowHeight = 14;
  const linhasPorPagina = 32;
  const pages = [];

  const totalPaginas = Math.max(1, Math.ceil(rows.length / linhasPorPagina));
  for (let pagina = 0; pagina < totalPaginas; pagina++) {
    const inicio = pagina * linhasPorPagina;
    const paginaRows = rows.slice(inicio, inicio + linhasPorPagina);
    const ops = [];

    ops.push('0.96 0.96 0.96 rg');
    ops.push(`20 ${pageHeight - 70} ${pageWidth - 40} 22 re f`);
    ops.push('0 0 0 rg');
    ops.push(`BT /F2 14 Tf 20 ${pageHeight - 40} Td (${pdfEscape(titulo)}) Tj ET`);
    ops.push(`BT /F1 8 Tf 20 ${pageHeight - 55} Td (${pdfEscape(subtotal)}) Tj ET`);
    ops.push(`BT /F1 7 Tf 20 ${pageHeight - 66} Td (${pdfEscape(filtros)}) Tj ET`);

    let x = 20;
    ops.push('0.85 0.85 0.85 rg');
    for (const coluna of PDF_COLUNAS) {
      ops.push(`${coluna.x} ${pageHeight - 70} ${coluna.largura - 2} 22 re f`);
    }
    ops.push('0 0 0 rg');

    let headerY = pageHeight - 63;
    for (const coluna of PDF_COLUNAS) {
      ops.push(`BT /F2 7 Tf ${coluna.x + 2} ${headerY} Td (${pdfEscape(coluna.titulo)}) Tj ET`);
    }
    x = 20;
    ops.push('0.7 0.7 0.7 RG');
    ops.push(`20 ${pageHeight - 92} m ${pageWidth - 20} ${pageHeight - 92} l S`);

    let y = pageHeight - 102;
    for (const row of paginaRows) {
      for (const coluna of PDF_COLUNAS) {
        const valor = truncate(coluna.campo(row), coluna.maxChars);
        ops.push(`BT /F1 7 Tf ${coluna.x + 2} ${y} Td (${pdfEscape(valor)}) Tj ET`);
      }
      ops.push('0.9 0.9 0.9 RG');
      ops.push(`20 ${y - 4} m ${pageWidth - 20} ${y - 4} l S`);
      y -= rowHeight;
    }

    ops.push(`BT /F1 7 Tf 20 18 Td (Página ${pagina + 1} de ${totalPaginas}) Tj ET`);
    ops.push(`BT /F1 7 Tf ${pageWidth - 120} 18 Td (${pdfEscape(new Date().toLocaleString('pt-BR'))}) Tj ET`);

    pages.push(ops.join('\n'));
  }

  const objects = [];
  let nextId = 1;
  const allocate = () => nextId++;

  const catalogId = allocate();
  const pagesId = allocate();
  const fontRegularId = allocate();
  const fontBoldId = allocate();

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[fontRegularId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontBoldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  const kids = [];
  for (const stream of pages) {
    const pageId = allocate();
    const contentId = allocate();
    kids.push(`${pageId} 0 R`);
    objects[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  }

  objects[pagesId] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  for (let id = 1; id < nextId; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${nextId}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id < nextId; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

function createRelatoriosConsolidados({ pool }) {
  async function carregarOpcoes() {
    const [empresas] = await pool.query('SELECT id, nome FROM empresas ORDER BY nome ASC');
    const [empresasConfig] = await pool.query(
      'SELECT id, nome, ativo FROM empresas_config ORDER BY nome ASC'
    );
    const [relogios] = await pool.query(
      `SELECT num_serie, descricao, ativo, status
       FROM relogios
       ORDER BY descricao ASC, num_serie ASC`
    );
    const [locais] = await pool.query(
      `SELECT DISTINCT local AS nome
       FROM qrcod_2023
       WHERE local IS NOT NULL AND local <> ''
       ORDER BY local ASC`
    );
    const [locaisMarcacoes] = await pool.query(
      `SELECT DISTINCT nome_local AS nome FROM marcacoes_ponto
       WHERE nome_local IS NOT NULL AND nome_local <> ''
       UNION
       SELECT DISTINCT descricao_local AS nome FROM marcacoes_ponto
       WHERE descricao_local IS NOT NULL AND descricao_local <> ''`
    );

    const locaisUnicos = new Map();
    for (const item of [...locais, ...locaisMarcacoes]) {
      const nome = String(item.nome || '').trim();
      if (!nome) continue;
      const chave = normalizeTexto(nome);
      if (!locaisUnicos.has(chave)) locaisUnicos.set(chave, nome);
    }

    return {
      empresas,
      empresasConfig,
      relogios,
      locais: [...locaisUnicos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  }

  async function carregarFuncionarios(matriculas) {
    const porMatricula = new Map();

    for (const lote of chunk(matriculas, CHUNK_SIZE)) {
      if (lote.length === 0) continue;
      const [rows] = await pool.query(
        `SELECT matricula, nome, cargo, local, empresa_id, empresa
         FROM qrcod_2023
         WHERE matricula IN (?)`,
        [lote]
      );
      for (const row of rows) {
        const key = String(row.matricula ?? '').trim();
        if (!porMatricula.has(key)) porMatricula.set(key, []);
        porMatricula.get(key).push(row);
      }
    }

    return porMatricula;
  }

  function resolverFuncionario(porMatricula, matricula, empresaId) {
    const lista = porMatricula.get(String(matricula ?? '').trim()) || [];
    if (lista.length === 0) return null;
    if (empresaId !== null && empresaId !== undefined) {
      const exato = lista.find((row) => Number(row.empresa_id) === Number(empresaId));
      if (exato) return exato;
    }
    return lista[0];
  }

  async function consultar(filtros = {}) {
    const periodo = parsePeriodo(filtros.dataInicio, filtros.dataFim);

    const empresaIds = toNumberArray(filtros.empresaIds);
    const empresaConfigIds = toNumberArray(filtros.empresaConfigIds);
    const matriculas = toArray(filtros.matriculas);
    const numSeries = toArray(filtros.numSeries);
    const locais = toArray(filtros.locais);
    const busca = String(filtros.busca ?? '').trim();
    const tipoRegistro = filtros.tipoRegistro !== undefined && filtros.tipoRegistro !== ''
      ? Number(filtros.tipoRegistro)
      : null;

    const where = ['mp.data_marcacao >= ?', 'mp.data_marcacao < ?'];
    const params = [periodo.inicio, periodo.fimExclusivo];

    if (empresaIds.length > 0) {
      where.push('mp.empresa_id IN (?)');
      params.push(empresaIds);
    }
    if (empresaConfigIds.length > 0) {
      where.push('mp.empresa_config_id IN (?)');
      params.push(empresaConfigIds);
    }
    if (matriculas.length > 0) {
      where.push('mp.matricula IN (?)');
      params.push(matriculas);
    }
    if (Number.isFinite(tipoRegistro)) {
      where.push('mp.tipo_registro = ?');
      params.push(tipoRegistro);
    }

    const [rows] = await pool.query(
      `SELECT mp.id, mp.empresa_config_id, mp.empresa_id, mp.marcacao_id, mp.nsr,
              mp.data_marcacao, mp.data_insercao, mp.matricula, mp.cpf, mp.pis,
              mp.num_serie_relogio, mp.tipo_registro, mp.nome_local, mp.descricao_local,
              mp.codigo_unidade, mp.gps_latitude, mp.gps_longitude, mp.flag_fora_cerca,
              mp.atividade,
              ec.nome AS empresa_config_nome,
              e.nome AS empresa_nome
       FROM marcacoes_ponto mp
       LEFT JOIN empresas_config ec ON ec.id = mp.empresa_config_id
       LEFT JOIN empresas e ON e.id = mp.empresa_id
       WHERE ${where.join(' AND ')}
       ORDER BY mp.data_marcacao ASC, mp.id ASC
       LIMIT ${MAX_REGISTROS + 1}`,
      params
    );

    const truncado = rows.length > MAX_REGISTROS;
    const registrosBrutos = truncado ? rows.slice(0, MAX_REGISTROS) : rows;

    const matriculasEncontradas = [...new Set(
      registrosBrutos.map((row) => String(row.matricula ?? '').trim()).filter(Boolean)
    )];
    const porMatricula = await carregarFuncionarios(matriculasEncontradas);

    const [relogiosRows] = await pool.query(
      'SELECT num_serie, descricao FROM relogios'
    );
    const relogiosPorSerie = new Map();
    for (const relogio of relogiosRows) {
      relogiosPorSerie.set(normalizeNumSerie(relogio.num_serie), relogio.descricao || '');
    }

    const seriesFiltro = new Set(numSeries.map(normalizeNumSerie).filter(Boolean));
    const locaisFiltro = new Set(locais.map((local) => normalizeTexto(local)));
    const buscaNormalizada = normalizeTexto(busca);

    const registros = [];
    for (const row of registrosBrutos) {
      const funcionario = resolverFuncionario(porMatricula, row.matricula, row.empresa_id);
      const relogioDescricao = relogiosPorSerie.get(normalizeNumSerie(row.num_serie_relogio)) || '';
      const local = row.nome_local || row.descricao_local || funcionario?.local || '';

      if (seriesFiltro.size > 0 && !seriesFiltro.has(normalizeNumSerie(row.num_serie_relogio))) {
        continue;
      }
      if (locaisFiltro.size > 0) {
        const locaisRegistro = [
          row.nome_local,
          row.descricao_local,
          funcionario?.local,
        ]
          .filter(Boolean)
          .map((valor) => normalizeTexto(valor));
        if (!locaisRegistro.some((valor) => locaisFiltro.has(valor))) continue;
      }
      if (buscaNormalizada) {
        const alvo = normalizeTexto(
          `${row.matricula} ${funcionario?.nome || ''} ${funcionario?.cargo || ''}`
        );
        if (!alvo.includes(buscaNormalizada)) continue;
      }

      registros.push({
        id: row.id,
        empresa_config_id: row.empresa_config_id,
        empresa_config_nome: row.empresa_config_nome || '—',
        empresa_id: row.empresa_id,
        empresa_nome: row.empresa_nome || row.empresa_config_nome || 'Sem empresa',
        marcacao_id: row.marcacao_id,
        nsr: row.nsr,
        data_marcacao: row.data_marcacao,
        data_insercao: row.data_insercao,
        matricula: row.matricula,
        funcionario_nome: funcionario?.nome || '',
        cargo: funcionario?.cargo || '',
        cpf: row.cpf || '',
        pis: row.pis || '',
        num_serie_relogio: row.num_serie_relogio,
        relogio_descricao: relogioDescricao,
        tipo_registro: row.tipo_registro,
        tipo_registro_label: tipoRegistroLabel(row.tipo_registro),
        local,
        codigo_unidade: row.codigo_unidade || '',
        gps_latitude: row.gps_latitude || '',
        gps_longitude: row.gps_longitude || '',
        flag_fora_cerca: Number(row.flag_fora_cerca) === 1,
        atividade: row.atividade || '',
      });
    }

    const porEmpresaMap = new Map();
    const funcionariosSet = new Set();
    const relogiosSet = new Set();
    const diasSet = new Set();

    for (const registro of registros) {
      const chave = registro.empresa_id !== null && registro.empresa_id !== undefined
        ? `local:${registro.empresa_id}`
        : `api:${registro.empresa_config_id}`;

      if (!porEmpresaMap.has(chave)) {
        porEmpresaMap.set(chave, {
          empresa_id: registro.empresa_id,
          empresa_nome: registro.empresa_nome,
          empresa_config_id: registro.empresa_config_id,
          empresa_config_nome: registro.empresa_config_nome,
          registros: 0,
          funcionarios: new Set(),
          relogios: new Set(),
          dias: new Set(),
        });
      }

      const item = porEmpresaMap.get(chave);
      item.registros++;
      if (registro.matricula) item.funcionarios.add(registro.matricula);
      if (registro.num_serie_relogio) item.relogios.add(normalizeNumSerie(registro.num_serie_relogio));
      item.dias.add(dateKey(registro.data_marcacao));

      funcionariosSet.add(registro.matricula);
      relogiosSet.add(normalizeNumSerie(registro.num_serie_relogio));
      diasSet.add(dateKey(registro.data_marcacao));
    }

    const porEmpresa = [...porEmpresaMap.values()]
      .map((item) => ({
        empresa_id: item.empresa_id,
        empresa_nome: item.empresa_nome,
        empresa_config_id: item.empresa_config_id,
        empresa_config_nome: item.empresa_config_nome,
        registros: item.registros,
        funcionarios: item.funcionarios.size,
        relogios: item.relogios.size,
        dias: item.dias.size,
      }))
      .sort((a, b) => b.registros - a.registros || a.empresa_nome.localeCompare(b.empresa_nome));

    return {
      success: true,
      periodo: {
        dataInicio: periodo.inicioLabel,
        dataFim: periodo.fimLabel,
      },
      totalGeral: {
        registros: registros.length,
        funcionarios: funcionariosSet.size,
        empresas: porEmpresa.length,
        relogios: relogiosSet.size,
        dias: diasSet.size,
      },
      porEmpresa,
      registros,
      truncado,
      limite: MAX_REGISTROS,
    };
  }

  function filtrosResumo(filtros, resultado) {
    const partes = [
      `Período: ${resultado.periodo.dataInicio} a ${resultado.periodo.dataFim}`,
      `Registros: ${resultado.totalGeral.registros}`,
      `Funcionários: ${resultado.totalGeral.funcionarios}`,
      `Empresas: ${resultado.totalGeral.empresas}`,
      `Relógios: ${resultado.totalGeral.relogios}`,
    ];
    if (filtros.busca) partes.push(`Busca: ${filtros.busca}`);
    return partes.join('  |  ');
  }

  function gerarCsv(resultado) {
    const cabecalho = [
      'Data', 'Hora', 'Matrícula', 'Funcionário', 'Empresa', 'Empresa da API',
      'Relógio', 'Nº de série', 'NSR', 'Tipo', 'Local', 'CPF', 'PIS',
      'Fora da cerca', 'Latitude', 'Longitude',
    ];

    const linhas = resultado.registros.map((row) => [
      formatDate(row.data_marcacao),
      formatTime(row.data_marcacao),
      row.matricula,
      row.funcionario_nome,
      row.empresa_nome,
      row.empresa_config_nome,
      row.relogio_descricao,
      row.num_serie_relogio,
      row.nsr ?? '',
      row.tipo_registro_label,
      row.local,
      row.cpf,
      row.pis,
      row.flag_fora_cerca ? 'Sim' : 'Não',
      row.gps_latitude,
      row.gps_longitude,
    ].map(csvEscape).join(';'));

    return `\uFEFF${cabecalho.join(';')}\r\n${linhas.join('\r\n')}\r\n`;
  }

  function gerarExcel(resultado, filtros) {
    const cabecalho = [
      'Data', 'Hora', 'Matrícula', 'Funcionário', 'Empresa', 'Empresa da API',
      'Relógio', 'Nº de série', 'NSR', 'Tipo', 'Local', 'CPF', 'PIS',
      'Fora da cerca', 'Latitude', 'Longitude',
    ];

    const linhas = resultado.registros.map((row) => [
      formatDate(row.data_marcacao),
      formatTime(row.data_marcacao),
      row.matricula,
      row.funcionario_nome,
      row.empresa_nome,
      row.empresa_config_nome,
      row.relogio_descricao,
      row.num_serie_relogio,
      row.nsr ?? '',
      row.tipo_registro_label,
      row.local,
      row.cpf,
      row.pis,
      row.flag_fora_cerca ? 'Sim' : 'Não',
      row.gps_latitude,
      row.gps_longitude,
    ].map(htmlEscape));

    const resumo = resultado.porEmpresa.map((item) =>
      `<tr><td>${htmlEscape(item.empresa_nome)}</td><td>${item.registros}</td>` +
      `<td>${item.funcionarios}</td><td>${item.relogios}</td><td>${item.dias}</td></tr>`
    ).join('');

    return `<html><head><meta charset="utf-8" />
      <style>
        table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
        th, td { border: 1px solid #999; padding: 3px 6px; }
        th { background: #e5e7eb; }
        h2 { font-family: Arial, sans-serif; }
      </style></head><body>
      <h2>Relatório consolidado de marcações</h2>
      <p>${htmlEscape(filtrosResumo(filtros, resultado))}</p>
      <h3>Totais por empresa</h3>
      <table><thead><tr><th>Empresa</th><th>Registros</th><th>Funcionários</th><th>Relógios</th><th>Dias</th></tr></thead>
      <tbody>${resumo || '<tr><td colspan="5">Sem registros</td></tr>'}</tbody></table>
      <h3>Registros</h3>
      <table><thead><tr>${cabecalho.map((titulo) => `<th>${titulo}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map((linha) => `<tr>${linha.map((valor) => `<td>${valor}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </body></html>`;
  }

  function gerarPdf(resultado, filtros) {
    return buildPdf({
      titulo: 'Relatório consolidado de marcações',
      subtotal: filtrosResumo(filtros, resultado),
      filtros: resultado.truncado
        ? `Atenção: exibindo os primeiros ${resultado.limite} registros. Refine os filtros para exportar o restante.`
        : 'Exportação completa do período selecionado.',
      rows: resultado.registros,
    });
  }

  async function exportar(filtros = {}, formato = 'csv') {
    const resultado = await consultar(filtros);
    const normalizado = String(formato || 'csv').toLowerCase();

    if (normalizado === 'csv') {
      return {
        buffer: Buffer.from(gerarCsv(resultado), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        nome: `relatorio-consolidado-${resultado.periodo.dataInicio}-a-${resultado.periodo.dataFim}.csv`,
      };
    }
    if (normalizado === 'xls' || normalizado === 'excel') {
      return {
        buffer: Buffer.from(gerarExcel(resultado, filtros), 'utf8'),
        contentType: 'application/vnd.ms-excel; charset=utf-8',
        nome: `relatorio-consolidado-${resultado.periodo.dataInicio}-a-${resultado.periodo.dataFim}.xls`,
      };
    }
    if (normalizado === 'pdf') {
      return {
        buffer: gerarPdf(resultado, filtros),
        contentType: 'application/pdf',
        nome: `relatorio-consolidado-${resultado.periodo.dataInicio}-a-${resultado.periodo.dataFim}.pdf`,
      };
    }

    throw new Error("Formato inválido: use 'csv', 'xls' ou 'pdf'");
  }

  return {
    carregarOpcoes,
    consultar,
    exportar,
  };
}

module.exports = {
  createRelatoriosConsolidados,
  parsePeriodo,
};
