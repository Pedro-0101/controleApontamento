/**
 * Camada de abstração entre os provedores de ponto.
 *
 * Hoje existem dois provedores:
 *  - `pontocertificado`: integração antiga (backend/ponto-api.js)
 *  - `exata`: nova API ExataWeb (backend/exata-api.js)
 *
 * A empresa da API (`empresas_config.provedor`) define qual implementação é
 * usada. Nada da Ponto Certificado é removido: ela apenas passa a ser um dos
 * provedores disponíveis.
 *
 * Interface comum:
 *  - listarEmpresas(company)
 *  - listarFuncionarios(company, empresasistema)
 *  - listarStatusFuncionarios(company, empresasistema)
 *  - buscarPontos(company, filtros)
 *  - confirmarPontos(company, pontos)
 */

const { createExataApi } = require('./exata-api');

const PROVEDOR_PONTO_CERTIFICADO = 'pontocertificado';
const PROVEDOR_EXATA = 'exata';

const PROVEDORES = [PROVEDOR_PONTO_CERTIFICADO, PROVEDOR_EXATA];

function normalizarProvedor(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === PROVEDOR_EXATA ? PROVEDOR_EXATA : PROVEDOR_PONTO_CERTIFICADO;
}

function getProvedor(company) {
  return normalizarProvedor(company?.provedor);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateTimeBr(value, defaultTime = 'start') {
  if (value === null || value === undefined || value === '') return null;

  const horasPadrao = defaultTime === 'end' ? '23:59:59' : '00:00:00';

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;

    const comHora = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ ,T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (comHora) {
      return `${comHora[1]}/${comHora[2]}/${comHora[3]} ${comHora[4]}:${comHora[5]}:${comHora[6] || '00'}`;
    }

    const somenteDataBr = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (somenteDataBr) {
      return `${somenteDataBr[1]}/${somenteDataBr[2]}/${somenteDataBr[3]} ${horasPadrao}`;
    }

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (iso) {
      const horas = iso[4]
        ? `${iso[4]}:${iso[5]}:${iso[6] || '00'}`
        : horasPadrao;
      return `${iso[3]}/${iso[2]}/${iso[1]} ${horas}`;
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${horasPadrao}`;
}

/**
 * Provedor Ponto Certificado. Mantém exatamente o comportamento atual da API,
 * apenas exposto pela interface comum.
 */
function createPontoCertificadoProvider(pontoApi) {
  if (!pontoApi) throw new Error('pontoApi é obrigatório para o provedor Ponto Certificado');

  return {
    provedor: PROVEDOR_PONTO_CERTIFICADO,

    async listarEmpresas(company) {
      // A Ponto Certificado não possui endpoint de empresas: cada conta já é
      // uma empresa. Retorna uma entrada sintética para a interface comum.
      return [{
        empresasistema: company?.chave ?? company?.id ?? null,
        empresacliente: company?.chave ?? company?.id ?? null,
        descricao: company?.nome ?? '',
      }];
    },

    async listarFuncionarios(company) {
      return pontoApi.callOperation(company, 'ListarFuncionarios', {});
    },

    async listarStatusFuncionarios() {
      // Recurso não existe na Ponto Certificado.
      return [];
    },

    async buscarPontos(company, filtros = {}) {
      const {
        dataInicio,
        dataFim,
        dtInicial,
        dtFinal,
        matriculaFuncionario = null,
        numSerieRelogio = null,
      } = filtros;

      const inicio = formatDateTimeBr(dataInicio ?? dtInicial, 'start');
      const fim = formatDateTimeBr(dataFim ?? dtFinal, 'end');
      if (!inicio || !fim) {
        throw new Error('Período inválido: informe dataInicio e dataFim');
      }

      return pontoApi.callOperation(company, 'SelecionaMarcacoes', {
        numSerieRelogio: numSerieRelogio || '',
        matriculaFuncionario: matriculaFuncionario || '',
        dataInicio: inicio,
        dataFim: fim,
      });
    },

    async confirmarPontos() {
      // A Ponto Certificado já considera o ponto recebido na consulta.
      return { retorno: 'OK', provedor: PROVEDOR_PONTO_CERTIFICADO, confirmados: 0 };
    },
  };
}

/**
 * Provedor ExataWeb. As credenciais são globais (backend/.env); o
 * `empresasistema` identifica a empresa dentro da conta.
 */
function createExataProvider(exataApi) {
  if (!exataApi) throw new Error('exataApi é obrigatório para o provedor Exata');

  function resolverEmpresa(company, empresasistema) {
    const codigo = empresasistema ?? company?.empresasistema;
    if (codigo === null || codigo === undefined || codigo === '') {
      throw new Error('Informe o empresasistema da Exata para esta operação');
    }
    return codigo;
  }

  return {
    provedor: PROVEDOR_EXATA,

    async listarEmpresas() {
      return exataApi.listarEmpresas();
    },

    async listarFuncionarios(company, empresasistema) {
      return exataApi.listarFuncionarios(resolverEmpresa(company, empresasistema));
    },

    async listarStatusFuncionarios(company, empresasistema) {
      return exataApi.listarStatusFuncionarios(resolverEmpresa(company, empresasistema));
    },

    async buscarPontos(company, filtros = {}) {
      const empresa = resolverEmpresa(company, filtros.empresa ?? filtros.empresasistema);
      return exataApi.buscarPontos({
        empresa,
        qtde: filtros.qtde,
        dtInicial: filtros.dtInicial ?? filtros.dataInicio,
        dtFinal: filtros.dtFinal ?? filtros.dataFim,
        status: filtros.status ?? 'N',
      });
    },

    async confirmarPontos(company, pontos) {
      return exataApi.confirmarPontos(
        (pontos || []).map((ponto) => ({
          empresa: ponto.empresa ?? resolverEmpresa(company),
          nsr: ponto.nsr,
          reppid: ponto.reppid,
        }))
      );
    },
  };
}

/**
 * Cria a camada de provedores.
 *
 * @param {object} options
 * @param {object} options.pontoApi cliente da Ponto Certificado
 * @param {object} [options.exataApi] cliente da Exata (criado a partir do .env se omitido)
 */
function createProvedorApi({ pontoApi, exataApi } = {}) {
  const exata = exataApi || createExataApi();
  const providers = {
    [PROVEDOR_PONTO_CERTIFICADO]: createPontoCertificadoProvider(pontoApi),
    [PROVEDOR_EXATA]: createExataProvider(exata),
  };

  function resolve(company) {
    return providers[getProvedor(company)];
  }

  return {
    resolve,
    getProvedor,
    normalizarProvedor,
    listarEmpresas(company) {
      return resolve(company).listarEmpresas(company);
    },
    listarFuncionarios(company, empresasistema) {
      return resolve(company).listarFuncionarios(company, empresasistema);
    },
    listarStatusFuncionarios(company, empresasistema) {
      return resolve(company).listarStatusFuncionarios(company, empresasistema);
    },
    buscarPontos(company, filtros) {
      return resolve(company).buscarPontos(company, filtros);
    },
    confirmarPontos(company, pontos) {
      return resolve(company).confirmarPontos(company, pontos);
    },
  };
}

module.exports = {
  createProvedorApi,
  getProvedor,
  normalizarProvedor,
  formatDateTimeBr,
  PROVEDOR_PONTO_CERTIFICADO,
  PROVEDOR_EXATA,
  PROVEDORES,
};
