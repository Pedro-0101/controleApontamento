/**
 * Cliente HTTP da API ExataWeb (Portaria 671).
 *
 * Responsabilidades:
 *  - Autenticar em POST /login e cachear o token JWT até o `exp`.
 *  - Enviar `Authorization: Bearer <token>` nas chamadas protegidas.
 *  - Renovar o token uma única vez em respostas 401/403.
 *  - Normalizar os formatos de erro da API (400 com array, 406 com string).
 *  - Respeitar timeout configurável sem nunca registrar token/senha em log.
 *
 * As credenciais são globais da conta Exata e vêm de variáveis de ambiente:
 *   EXATA_API_BASE_URL, EXATA_API_USER, EXATA_API_PASSWORD
 */

const DEFAULT_TIMEOUT_MS = 30 * 1000;
const DEFAULT_TOKEN_TTL_MS = 15 * 60 * 1000;
// Renova o token um pouco antes do vencimento para evitar corrida no limite.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

class ExataApiError extends Error {
  constructor(message, { status = null, details = null } = {}) {
    super(message);
    this.name = 'ExataApiError';
    this.status = status;
    this.details = details;
  }
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function getExataConfig(overrides = {}) {
  return {
    baseUrl: normalizeBaseUrl(overrides.baseUrl ?? process.env.EXATA_API_BASE_URL),
    user: String(overrides.user ?? process.env.EXATA_API_USER ?? '').trim(),
    password: String(overrides.password ?? process.env.EXATA_API_PASSWORD ?? ''),
    timeoutMs: toPositiveNumber(
      overrides.timeoutMs ?? process.env.EXATA_API_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
    tokenTtlMs: toPositiveNumber(
      overrides.tokenTtlMs ?? process.env.EXATA_TOKEN_TTL_MS,
      DEFAULT_TOKEN_TTL_MS
    ),
  };
}

function assertCredentials(config) {
  if (!config.baseUrl || !config.user || !config.password) {
    throw new ExataApiError(
      'Credenciais da ExataWeb não configuradas: defina EXATA_API_BASE_URL, EXATA_API_USER e EXATA_API_PASSWORD'
    );
  }
}

/** Extrai o `exp` (segundos) de um JWT sem validar a assinatura. */
function tokenExpiresAt(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const exp = Number(payload?.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

async function readResponseBody(response) {
  let text = '';
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (!text) return null;

  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  const trimmed = text.trim();
  const looksJson = contentType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[');

  if (looksJson) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
}

function describeErrorPayload(payload) {
  if (Array.isArray(payload)) {
    const mensagens = payload
      .map((item) => (typeof item === 'string' ? item : item?.retorno))
      .filter(Boolean);
    return mensagens.slice(0, 3).join('; ');
  }
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    if (payload.retorno) return String(payload.retorno);
    if (payload.message) return String(payload.message);
  }
  return '';
}

function buildHttpError(status, payload) {
  const detalhe = describeErrorPayload(payload);
  const prefixo = `ExataWeb respondeu HTTP ${status}`;
  const mensagem = detalhe ? `${prefixo}: ${detalhe}` : prefixo;
  return new ExataApiError(mensagem, { status, details: payload });
}

/**
 * Formata uma data para DD/MM/AAAA, formato aceito pela API.
 * Aceita Date, AAAA-MM-DD ou DD/MM/AAAA.
 * @returns {string|null}
 */
function formatDateBr(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const dia = String(value.getDate()).padStart(2, '0');
    const mes = String(value.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${value.getFullYear()}`;
  }

  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const dia = String(parsed.getDate()).padStart(2, '0');
  const mes = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${parsed.getFullYear()}`;
}

/**
 * Cria uma instância do cliente ExataWeb.
 *
 * @param {object} [options]
 * @param {string} [options.baseUrl]
 * @param {string} [options.user]
 * @param {string} [options.password]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.tokenTtlMs] fallback quando o JWT não traz `exp`
 * @param {Function} [options.fetchImpl] injeção usada nos testes
 */
function createExataApi(options = {}) {
  const config = getExataConfig(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let cache = { token: null, expiresAt: 0 };

  if (typeof fetchImpl !== 'function') {
    throw new ExataApiError('fetch não disponível no ambiente Node');
  }

  function clearToken() {
    cache = { token: null, expiresAt: 0 };
  }

  async function fetchToken() {
    assertCredentials(config);

    const response = await fetchImpl(`${config.baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ userName: config.user, password: config.password }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    const payload = await readResponseBody(response);
    if (!response.ok) throw buildHttpError(response.status, payload);

    const token = typeof payload?.token === 'string' ? payload.token : '';
    if (!token) {
      throw new ExataApiError('Resposta de login da ExataWeb sem token');
    }

    const expiresAt = tokenExpiresAt(token) || (Date.now() + config.tokenTtlMs);
    cache = { token, expiresAt };
    return token;
  }

  /** Retorna um token válido, reaproveitando o cache quando possível. */
  async function login({ force = false } = {}) {
    if (!force && cache.token && cache.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
      return cache.token;
    }
    return fetchToken();
  }

  async function performRequest(method, apiPath, body, jaRenovou) {
    const token = await login();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    const init = { method, headers, signal: AbortSignal.timeout(config.timeoutMs) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const url = `${config.baseUrl}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`;
    const response = await fetchImpl(url, init);
    const payload = await readResponseBody(response);

    if ((response.status === 401 || response.status === 403) && !jaRenovou) {
      clearToken();
      await login({ force: true });
      return performRequest(method, apiPath, body, true);
    }

    if (!response.ok) throw buildHttpError(response.status, payload);
    return payload;
  }

  /**
   * Executa uma requisição autenticada.
   * Em 401/403 renova o token e repete apenas uma vez.
   */
  async function request(method, apiPath, body) {
    return performRequest(String(method || 'GET').toUpperCase(), apiPath, body, false);
  }

  async function listarEmpresas() {
    return request('GET', '/integra/v1/protected/empresas');
  }

  async function listarFuncionarios(empresasistema) {
    if (empresasistema === null || empresasistema === undefined || empresasistema === '') {
      throw new ExataApiError('Informe o código empresasistema para listar funcionários');
    }
    return request(
      'GET',
      `/integra/v1/protected/funcionarios/${encodeURIComponent(String(empresasistema))}`
    );
  }

  async function listarStatusFuncionarios(empresasistema) {
    if (empresasistema === null || empresasistema === undefined || empresasistema === '') {
      throw new ExataApiError('Informe o código empresasistema para listar status de funcionários');
    }
    return request(
      'GET',
      `/integra/v1/protected/v2/status_funcionarios/read/${encodeURIComponent(String(empresasistema))}`
    );
  }

  /**
   * Consulta pontos no padrão Portaria 671.
   * @param {object} filtros
   * @param {number|string} filtros.empresa empresasistema
   * @param {number} [filtros.qtde=100]
   * @param {string|Date} filtros.dtInicial
   * @param {string|Date} filtros.dtFinal
   * @param {'N'|'S'} [filtros.status='N']
   */
  async function buscarPontos({ empresa, qtde = 100, dtInicial, dtFinal, status = 'N' } = {}) {
    if (empresa === null || empresa === undefined || empresa === '') {
      throw new ExataApiError('Informe o código da empresa para buscar pontos');
    }

    const inicio = formatDateBr(dtInicial);
    const fim = formatDateBr(dtFinal);
    if (!inicio || !fim) {
      throw new ExataApiError('Período inválido: informe dtInicial e dtFinal (DD/MM/AAAA)');
    }

    return request('POST', '/integra/v2/protected/pontos671', {
      empresa: Number(empresa),
      qtde: toPositiveNumber(qtde, 100),
      dtInicial: inicio,
      dtFinal: fim,
      status: status === 'S' ? 'S' : 'N',
    });
  }

  /**
   * Confirma na Exata o recebimento dos pontos.
   * @param {Array<{empresa:number|string, nsr:number|string, reppid:number|string}>} pontos
   */
  async function confirmarPontos(pontos) {
    if (!Array.isArray(pontos)) {
      throw new ExataApiError('confirmarPontos espera um array de pontos');
    }
    if (pontos.length === 0) return { retorno: 'OK' };

    const payload = pontos.map((ponto) => ({
      empresa: Number(ponto.empresa),
      nsr: Number(ponto.nsr),
      reppid: Number(ponto.reppid),
    }));

    return request('POST', '/integra/v2/protected/baixaponto671', payload);
  }

  return {
    config: {
      baseUrl: config.baseUrl,
      user: config.user,
      timeoutMs: config.timeoutMs,
      tokenTtlMs: config.tokenTtlMs,
    },
    login,
    getToken: login,
    invalidate: clearToken,
    request,
    listarEmpresas,
    listarFuncionarios,
    listarStatusFuncionarios,
    buscarPontos,
    confirmarPontos,
  };
}

module.exports = {
  createExataApi,
  ExataApiError,
  getExataConfig,
  formatDateBr,
  tokenExpiresAt,
  DEFAULT_TIMEOUT_MS,
};
