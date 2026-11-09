const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProvedorApi,
  getProvedor,
  formatDateTimeBr,
  PROVEDOR_EXATA,
  PROVEDOR_PONTO_CERTIFICADO,
} = require('./provedor-api');

function criarPontoApiFake() {
  const chamadas = [];
  return {
    chamadas,
    async callOperation(company, operacao, body) {
      chamadas.push({ company, operacao, body });
      return [{ Matricula: '001', Nome: 'FULANO' }];
    },
  };
}

function criarExataApiFake() {
  const chamadas = [];
  return {
    chamadas,
    async listarEmpresas() {
      return [{ empresasistema: 10, descricao: 'EMPRESA EXATA' }];
    },
    async listarFuncionarios(empresasistema) {
      chamadas.push({ metodo: 'listarFuncionarios', empresasistema });
      return [{ matricula: '001' }];
    },
    async listarStatusFuncionarios(empresasistema) {
      chamadas.push({ metodo: 'listarStatusFuncionarios', empresasistema });
      return [{ id: 1, descricao: 'ATIVO' }];
    },
    async buscarPontos(filtros) {
      chamadas.push({ metodo: 'buscarPontos', filtros });
      return [{ nsr: 1, reppid: 2 }];
    },
    async confirmarPontos(pontos) {
      chamadas.push({ metodo: 'confirmarPontos', pontos });
      return { retorno: 'OK' };
    },
  };
}

test('empresa sem provedor explícito usa Ponto Certificado', () => {
  assert.equal(getProvedor({}), PROVEDOR_PONTO_CERTIFICADO);
  assert.equal(getProvedor({ provedor: 'EXATA' }), PROVEDOR_EXATA);
  assert.equal(getProvedor({ provedor: 'outro' }), PROVEDOR_PONTO_CERTIFICADO);
});

test('provedor Ponto Certificado mantém as operações existentes', async () => {
  const pontoApi = criarPontoApiFake();
  const provedor = createProvedorApi({ pontoApi, exataApi: criarExataApiFake() });
  const company = { id: 1, nome: 'DNP', chave: 'CHAVE' };

  const funcionarios = await provedor.listarFuncionarios(company);
  assert.equal(funcionarios[0].Nome, 'FULANO');
  assert.equal(pontoApi.chamadas[0].operacao, 'ListarFuncionarios');

  const pontos = await provedor.buscarPontos(company, {
    dataInicio: '2026-11-09',
    dataFim: '2026-11-10',
  });
  assert.equal(pontos[0].Matricula, '001');
  assert.equal(pontoApi.chamadas[1].operacao, 'SelecionaMarcacoes');
  assert.equal(pontoApi.chamadas[1].body.dataInicio, '09/11/2026 00:00:00');
  assert.equal(pontoApi.chamadas[1].body.dataFim, '10/11/2026 23:59:59');

  const baixa = await provedor.confirmarPontos(company, [{ nsr: 1 }]);
  assert.equal(baixa.confirmados, 0);
  assert.equal(pontoApi.chamadas.length, 2);
});

test('provedor Exata delega usando o empresasistema', async () => {
  const pontoApi = criarPontoApiFake();
  const exataApi = criarExataApiFake();
  const provedor = createProvedorApi({ pontoApi, exataApi });
  const company = { id: 2, nome: 'EXATA', provedor: 'exata', empresasistema: 10 };

  const empresas = await provedor.listarEmpresas(company);
  assert.equal(empresas[0].empresasistema, 10);

  await provedor.listarFuncionarios(company, 99);
  await provedor.listarStatusFuncionarios(company);
  await provedor.buscarPontos(company, {
    dtInicial: '2026-11-09',
    dtFinal: '2026-11-09',
    qtde: 25,
  });
  await provedor.confirmarPontos(company, [{ nsr: 5, reppid: 7 }]);

  assert.deepEqual(exataApi.chamadas[0], { metodo: 'listarFuncionarios', empresasistema: 99 });
  assert.deepEqual(exataApi.chamadas[1], { metodo: 'listarStatusFuncionarios', empresasistema: 10 });
  assert.deepEqual(exataApi.chamadas[2], {
    metodo: 'buscarPontos',
    filtros: {
      empresa: 10,
      qtde: 25,
      dtInicial: '2026-11-09',
      dtFinal: '2026-11-09',
      status: 'N',
    },
  });
  assert.deepEqual(exataApi.chamadas[3], {
    metodo: 'confirmarPontos',
    pontos: [{ empresa: 10, nsr: 5, reppid: 7 }],
  });
});

test('provedor Exata exige empresasistema', async () => {
  const provedor = createProvedorApi({
    pontoApi: criarPontoApiFake(),
    exataApi: criarExataApiFake(),
  });

  await assert.rejects(
    () => provedor.listarFuncionarios({ provedor: 'exata' }),
    /empresasistema/
  );
});

test('formatDateTimeBr preserva horário e completa o padrão da API', () => {
  assert.equal(formatDateTimeBr('09/11/2026', 'start'), '09/11/2026 00:00:00');
  assert.equal(formatDateTimeBr('09/11/2026', 'end'), '09/11/2026 23:59:59');
  assert.equal(
    formatDateTimeBr('09/11/2026 08:30', 'start'),
    '09/11/2026 08:30:00'
  );
  assert.equal(
    formatDateTimeBr('09/11/2026 08:30:45', 'start'),
    '09/11/2026 08:30:45'
  );
});
