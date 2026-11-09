/**
 * Observabilidade da integração ExataWeb.
 *
 * Centraliza logs operacionais e métricas para que:
 *  - toda linha de log tenha operação, contexto (`empresa_config_id`,
 *    `empresasistema`) e contadores;
 *  - credenciais/tokens nunca sejam impressos;
 *  - os contadores de pontos sejam calculados de forma consistente entre o
 *    retorno da sincronização e a auditoria em `sincronizacao_execucao`.
 */

const CAMPOS_SENSIVEIS = /(token|senha|password|authorization|secret|credencial)/i;
const TAMANHO_MAX_VALOR = 300;
const TAMANHO_MAX_OBJETO = 500;

function numeroSeguro(value) {
  const numero = Number(value);
  return Number.isFinite(numero) ? numero : 0;
}

function sanitizarValor(chave, valor) {
  if (CAMPOS_SENSIVEIS.test(String(chave))) return '[redacted]';

  if (typeof valor === 'string') {
    return valor.length > TAMANHO_MAX_VALOR
      ? `${valor.slice(0, TAMANHO_MAX_VALOR)}...`
      : valor;
  }

  if (typeof valor === 'object') {
    try {
      const texto = JSON.stringify(valor);
      return texto.length > TAMANHO_MAX_OBJETO
        ? `${texto.slice(0, TAMANHO_MAX_OBJETO)}...`
        : texto;
    } catch {
      return '[objeto]';
    }
  }

  return valor;
}

/**
 * Remove campos vazios e mascara chaves sensíveis antes de montar o log.
 * @param {Record<string, unknown>} dados
 */
function sanitizarDados(dados = {}) {
  const saida = {};
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor === undefined || valor === null || valor === '') continue;
    saida[chave] = sanitizarValor(chave, valor);
  }
  return saida;
}

/** Monta uma linha de log no formato `[Exata] operacao chave=valor ...`. */
function formatarLogExata(operacao, dados = {}) {
  const partes = Object.entries(sanitizarDados(dados))
    .map(([chave, valor]) => `${chave}=${valor}`);
  return `[Exata] ${String(operacao || 'operacao')}${partes.length ? ` ${partes.join(' ')}` : ''}`;
}

/**
 * Cria um logger da Exata. `consoleImpl` é injetável nos testes e permite
 * capturar as linhas sem alterar o comportamento da sincronização.
 */
function criarLoggerExata({ consoleImpl = console } = {}) {
  return function logExata(operacao, dados = {}) {
    consoleImpl.log(formatarLogExata(operacao, dados));
  };
}

/** Métricas padronizadas de uma execução de pontos. */
function metricasPontos(stats = {}) {
  const inseridos = numeroSeguro(stats.inseridos);
  const atualizados = numeroSeguro(stats.atualizados);
  return {
    buscados: numeroSeguro(stats.buscados),
    inseridos,
    atualizados,
    persistidos: inseridos + atualizados,
    ignorados: numeroSeguro(stats.ignorados),
    baixados: numeroSeguro(stats.baixados),
    erros: numeroSeguro(stats.errosBaixa ?? stats.erros),
  };
}

/**
 * Remove segredos conhecidos de textos livres (mensagens de erro, detalhes de
 * resposta da API). Usado como cinto de segurança adicional nos logs.
 */
function sanitizarTexto(texto, segredos = []) {
  let saida = String(texto ?? '');
  for (const segredo of segredos) {
    const valor = String(segredo ?? '');
    if (valor.length < 4) continue;
    saida = saida.split(valor).join('***');
  }
  return saida;
}

module.exports = {
  CAMPOS_SENSIVEIS,
  sanitizarDados,
  sanitizarValor,
  formatarLogExata,
  criarLoggerExata,
  metricasPontos,
  sanitizarTexto,
};
