/**
 * Integração com a API Ponto Certificado — autenticação e tokens.
 *
 * Responsabilidades:
 *  - Executar StartSession por empresa com classificação de erros da API.
 *  - Cachear tokens em memória (evita um StartSession a cada requisição).
 *  - Fornecer tokens válidos para as rotas locais.
 *  - Detectar mensagens de token inválido/expirado retornadas pela API.
 */

const DEFAULT_BASE_URL = 'https://integrar.pontocertificado.com.br';
const DEFAULT_TIMEOUT_MS = 30 * 1000;
const DEFAULT_TOKEN_TTL_MS = 15 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 60 * 1000;

// Mensagens de erro retornadas pela API no campo `d` (HTTP 200).
// A comparação é feita por palavra-chave porque a API não usa um código fixo.
const TOKEN_ERROR_KEYWORDS = [
  'desativada',
  'desativado',
  'contate o suporte',
  'não encontrada',
  'nao encontrada',
  'inválid',
  'invalid',
  'expirad',
  'token',
  'sessão',
  'sessao',
  'não autorizado',
  'nao autorizado',
  'unauthorized',
];

function getBaseUrl() {
  return (process.env.PONTO_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getTimeoutMs() {
  const value = Number(process.env.PONTO_API_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function getTokenTtlMs() {
  const value = Number(process.env.PONTO_TOKEN_TTL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOKEN_TTL_MS;
}

function isTokenErrorMessage(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  return TOKEN_ERROR_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(getTimeoutMs()),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  return response.json();
}

/**
 * Executa uma operação da API externa com um token já obtido.
 * Erros de negócio da API vêm em `d` (HTTP 200) e são convertidos em exceção.
 * @returns {Promise<any>} conteúdo de `d`
 */
async function postOperation(operation, body, token) {
  if (!token) throw new Error('Token de acesso ausente');

  const data = await fetchJson(`${getBaseUrl()}/Api.svc/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, tokenAcesso: token }),
  });

  const result = data?.d;
  if (isTokenErrorMessage(result)) {
    const error = new Error(String(result));
    error.tokenError = true;
    throw error;
  }

  return result;
}

/**
 * Executa StartSession para uma empresa.
 * @returns {{ token: string|null, erro: string|null }}
 */
async function startSession(company) {
  if (!company || !company.email || !company.senha || !company.chave) {
    return { token: null, erro: 'Credenciais da empresa incompletas' };
  }

  try {
    const data = await fetchJson(`${getBaseUrl()}/Api.svc/StartSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chaveEmpresa: company.chave,
        usuario: company.email,
        senha: company.senha,
      }),
    });

    const raw = data?.d ?? null;
    if (!raw) return { token: null, erro: 'Resposta vazia da API de autenticação' };

    // Tokens reais têm ~1150 caracteres. Mensagens de erro são curtas e podem
    // conter palavras como "token"/"inválido" — por isso o teste de tamanho.
    if (typeof raw === 'string' && raw.length > 500) {
      return { token: raw, erro: null };
    }
    if (isTokenErrorMessage(raw)) return { token: null, erro: String(raw) };

    return { token: String(raw), erro: null };
  } catch (error) {
    return {
      token: null,
      erro: error?.name === 'TimeoutError'
        ? 'Tempo esgotado ao autenticar na API'
        : (error?.message || 'Falha ao autenticar na API'),
    };
  }
}

/**
 * Cria o gerenciador de tokens ligado a um pool MySQL.
 */
function createPontoApi(pool) {
  const cache = new Map(); // companyId -> { token, erro, expiresAt }

  async function loadCompanies() {
    const [rows] = await pool.query(
      'SELECT id, nome, email, senha, chave FROM empresas_config WHERE ativo = 1 ORDER BY nome ASC'
    );
    return rows;
  }

  async function resolveCompany(company, force) {
    const cached = cache.get(company.id);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return {
        id: company.id,
        nome: company.nome,
        token: cached.token,
        erro: cached.erro,
      };
    }

    const { token, erro } = await startSession(company);
    cache.set(company.id, {
      token,
      erro,
      expiresAt: Date.now() + (token ? getTokenTtlMs() : ERROR_CACHE_TTL_MS),
    });

    return { id: company.id, nome: company.nome, token, erro };
  }

  /**
   * Retorna tokens de todas as empresas ativas.
   * @param {{ force?: boolean }} options force=true ignora o cache.
   */
  async function getCompanyTokens({ force = false } = {}) {
    const companies = await loadCompanies();
    return Promise.all(companies.map((company) => resolveCompany(company, force)));
  }

  /**
   * Retorna apenas os tokens válidos (strings) de todas as empresas ativas.
   */
  async function getActiveTokens({ force = false } = {}) {
    const tokens = await getCompanyTokens({ force });
    return tokens.map((entry) => entry.token).filter(Boolean);
  }

  function invalidate(companyId) {
    if (companyId === undefined) cache.clear();
    else cache.delete(companyId);
  }

  /**
   * Executa uma operação usando o token da empresa.
   * Se a API recusar o token, invalida o cache, renova a sessão e repete uma vez.
   */
  async function callOperation(company, operation, body = {}) {
    let entry = await resolveCompany(company, false);
    if (!entry.token) throw new Error(entry.erro || `Empresa ${company.nome} sem token de acesso`);

    try {
      return await postOperation(operation, body, entry.token);
    } catch (error) {
      if (!error?.tokenError) throw error;

      invalidate(company.id);
      entry = await resolveCompany(company, true);
      if (!entry.token) throw new Error(entry.erro || `Não foi possível renovar o token de ${company.nome}`);

      return postOperation(operation, body, entry.token);
    }
  }

  return {
    getCompanyTokens,
    getActiveTokens,
    callOperation,
    invalidate,
    startSession,
    isTokenErrorMessage,
  };
}

module.exports = {
  createPontoApi,
  startSession,
  isTokenErrorMessage,
  getBaseUrl,
  postOperation,
};
