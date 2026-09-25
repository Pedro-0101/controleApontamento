'use strict';

/**
 * Backfill da coluna `hora` em marcacao_desconsiderada.
 *
 * Registros antigos foram salvos sem a hora do ponto. Como o NSR pode vir como
 * 0 em algumas chamadas da API, o frontend casa os pontos por `relogio + hora`.
 * Este script descobre a hora de cada registro através da API Ponto Certificado
 * (casando por NSR + número de série do relógio) e grava de volta no banco.
 *
 * Uso:  node scripts/backfill-hora.js
 */

const mysql = require('mysql2/promise');

const API_BASE = 'https://integrar.pontocertificado.com.br/Api.svc';
const ERROS_API = ['desativada', 'contate o suporte', 'não encontrada', 'inválido', 'inválida', 'expirado'];

const dbConfig = {
  host: process.env.DB_HOST || '192.168.200.136',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'dnpmix',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'pass',
  charset: 'utf8mb4',
};

const pad = (n) => String(n).padStart(2, '0');

async function getTokens(pool) {
  const [companies] = await pool.query('SELECT nome, email, senha, chave FROM empresas_config WHERE ativo = 1');
  const tokens = [];
  for (const c of companies) {
    try {
      const r = await fetch(`${API_BASE}/StartSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chaveEmpresa: c.chave, usuario: c.email, senha: c.senha }),
      });
      const data = await r.json();
      const raw = data?.d ?? null;
      const isErro = raw && ERROS_API.some((k) => String(raw).toLowerCase().includes(k));
      if (!isErro) tokens.push({ nome: c.nome, token: raw });
    } catch (e) {
      console.warn(`[backfill] falha ao autenticar ${c.nome}:`, e.message);
    }
  }
  return tokens;
}

function parseApiDate(value) {
  if (!value) return null;
  const s = String(value);
  if (s.startsWith('/Date(')) {
    const ts = s.match(/\d+/);
    return ts ? new Date(parseInt(ts[0], 10)) : null;
  }
  const [datePart, timePart = '00:00:00'] = s.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hh || 0, mm || 0, ss || 0);
}

async function fetchMarks(token, dataIso) {
  const [y, m, d] = dataIso.split('-');
  const inicio = `${d}/${m}/${y} 00:00:00`;
  const fim = `${d}/${m}/${y} 23:59:59`;
  const r = await fetch(`${API_BASE}/SelecionaMarcacoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenAcesso: token, dataInicio: inicio, dataFim: fim }),
  });
  const data = await r.json();
  const arr = data?.d?.results || data?.d || data;
  return Array.isArray(arr) ? arr : [];
}

(async () => {
  const pool = await mysql.createPool(dbConfig);
  const tokens = await getTokens(pool);
  if (tokens.length === 0) {
    console.error('[backfill] Nenhum token válido. Abortando.');
    await pool.end();
    process.exit(1);
  }

  const [rows] = await pool.query(
    `SELECT id, matricula_funcionario, DATE_FORMAT(data, '%Y-%m-%d') AS data,
            marcacao_id, nsr, relogio_ns
       FROM marcacao_desconsiderada
      WHERE hora IS NULL`
  );
  console.log(`[backfill] ${rows.length} registro(s) sem hora.`);

  const cache = new Map();
  let atualizados = 0;
  let naoEncontrados = 0;

  for (const row of rows) {
    const iso = String(row.data).substring(0, 10);
    let hora = null;

    if (row.marcacao_id) {
      const [pm] = await pool.query('SELECT TIME_FORMAT(hora, "%H:%i:%s") AS hora FROM ponto_manual WHERE id = ?', [row.marcacao_id]);
      hora = pm[0]?.hora ?? null;
    } else {
      const cacheKey = `${row.matricula_funcionario}|${iso}`;
      if (!cache.has(cacheKey)) {
        const todas = [];
        for (const t of tokens) {
          try {
            todas.push(...(await fetchMarks(t.token, iso)));
          } catch (e) {
            console.warn(`[backfill] erro API ${t.nome} ${cacheKey}:`, e.message);
          }
        }
        cache.set(cacheKey, todas);
      }
      const marks = cache.get(cacheKey).filter(
        (x) => String(x.MatriculaFuncionario || '').trim() === String(row.matricula_funcionario).trim()
      );
      const alvo = marks.find((x) => {
        const sameNsr = row.nsr != null && String(x.NSR) === String(row.nsr);
        const sameRel = String(x.NumSerieRelogio || '') === String(row.relogio_ns || '');
        return sameNsr && sameRel;
      });
      if (alvo) {
        const dt = parseApiDate(alvo.DataMarcacao);
        if (dt) hora = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
      }
    }

    if (hora) {
      await pool.query('UPDATE marcacao_desconsiderada SET hora = ? WHERE id = ?', [hora, row.id]);
      atualizados++;
    } else {
      naoEncontrados++;
      console.warn(`[backfill] não localizado: id=${row.id} mat=${row.matricula_funcionario} data=${iso} nsr=${row.nsr} rel=${row.relogio_ns}`);
    }
  }

  console.log(`[backfill] concluído: ${atualizados} atualizado(s), ${naoEncontrados} não localizado(s).`);
  await pool.end();
})().catch((e) => {
  console.error('[backfill] erro fatal:', e);
  process.exit(1);
});
