const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizarFuncionario,
  normalizarPontoExata,
  mapStatusParaEvento,
  montarDataHoraExata,
  splitDiasExata,
  parseDateOnly,
  parseDateTime,
  encontrarEmpresaLocal,
  matriculaToString,
  gerarCsvValidacao,
} = require('./exata-sync');

test('matricula é sempre string e preserva zeros à esquerda', () => {
  assert.equal(matriculaToString('000123'), '000123');
  assert.equal(matriculaToString(123), '123');
  assert.equal(matriculaToString(null), '');
  assert.equal(matriculaToString('  42  '), '42');
});

test('parseDateOnly aceita DD/MM/AAAA e AAAA-MM-DD', () => {
  assert.equal(parseDateOnly('01/01/2024'), '2024-01-01');
  assert.equal(parseDateOnly('2024-12-31'), '2024-12-31');
  assert.equal(parseDateOnly(''), null);
  assert.equal(parseDateOnly('31/13/2024'), null);
  assert.equal(parseDateOnly('data inválida'), null);
});

test('parseDateTime preserva data/hora recebidas sem conversão de fuso', () => {
  assert.equal(parseDateTime('2024-01-01T00:00:00.000+00:00'), '2024-01-01 00:00:00');
  assert.equal(parseDateTime('2024-01-01 13:45:10'), '2024-01-01 13:45:10');
  assert.equal(parseDateTime('01/07/2024'), '2024-07-01 00:00:00');
  assert.equal(parseDateTime('01/07/2024 08:30'), '2024-07-01 08:30:00');
  assert.equal(parseDateTime(null), null);
});

test('normaliza funcionário da Exata preservando matrícula e campos', () => {
  const row = normalizarFuncionario(
    {
      matricula: 123,
      pis: 123456789101,
      cpf: '12345678901',
      codturma: '0007',
      descricaoTurma: 'LAVOURA',
      cartao: '987',
      nome: 'DENNIS TESSARI',
      email: 'dennis@exemplo.com',
      codErp: '1',
      centroCusto: '83848',
      codFuncao: '5',
      codSetor: '2',
      descSetor: 'Administrativo',
      admissao: '01/01/2024',
      intervaloMinimo: '30',
      status: 'S',
      statusInicio: '2024-01-01 00:00:00',
      statusFim: '2024-12-31 23:59:59',
      ultimamodificacao: '2024-01-01T00:00:00.000+00:00',
      ativo: 'S',
    },
    10,
    7
  );

  assert.equal(row.empresa_config_id, 10);
  assert.equal(row.empresasistema, 7);
  assert.equal(row.matricula, '123');
  assert.equal(row.pis, '123456789101');
  assert.equal(row.codturma, '0007');
  assert.equal(row.descricao_turma, 'LAVOURA');
  assert.equal(row.admissao, '2024-01-01');
  assert.equal(row.intervalo_minimo, 30);
  assert.equal(row.status_inicio, '2024-01-01 00:00:00');
  assert.equal(row.ultima_modificacao, '2024-01-01 00:00:00');
  assert.equal(row._ativo_local, 1);
});

test('normaliza funcionário sem matrícula como ignorado', () => {
  assert.equal(normalizarFuncionario({ nome: 'SEM MATRÍCULA' }, 1, 2), null);
  assert.equal(normalizarFuncionario({ matricula: '   ' }, 1, 2), null);
});

test('monta data/hora da Exata sem conversão de fuso', () => {
  assert.equal(montarDataHoraExata('02/10/2022', '19:11'), '2022-10-02 19:11:00');
  assert.equal(montarDataHoraExata('2022-10-02', '19:11:30'), '2022-10-02 19:11:30');
  assert.equal(montarDataHoraExata('31/02/2022', '10:00'), null);
  assert.equal(montarDataHoraExata('', '10:00'), null);
});

test('normaliza ponto da Exata usando (empresasistema, reppid, nsr)', () => {
  const row = normalizarPontoExata(
    {
      empresa: 7,
      nsr: 8010,
      reppid: 12,
      data: '02/10/2022',
      hora: '19:11',
      pis: 56,
      coletor: 2,
      matricula: 56,
      nome: 'CINQUENTA E SEIS',
      turma: 56,
      latitude: '0.0',
      longitude: '0.0',
      status: 'N',
      dataHoraColeta: '2022-10-02 19:12:10',
      hash: 'ABC',
      cpf: '7374311303',
      tipoColetor: '1',
      registro: 'REGISTRO',
    },
    10,
    7,
    3
  );

  assert.equal(row.empresa_config_id, 10);
  assert.equal(row.empresasistema, 7);
  assert.equal(row.empresa_id, 3);
  assert.equal(row.marcacao_id, null);
  assert.equal(row.nsr, 8010);
  assert.equal(row.reppid, 12);
  assert.equal(row.data_marcacao, '2022-10-02 19:11:00');
  assert.equal(row.matricula, '56');
  assert.equal(row.num_serie_relogio, '12');
  assert.equal(row.provedor, 'exata');
  assert.equal(row.status_exportacao, 'N');
  assert.equal(row.data_hora_coleta, '2022-10-02 19:12:10');
});

test('ignora ponto sem nsr/reppid ou sem data válida', () => {
  assert.equal(normalizarPontoExata({ reppid: 1, data: '02/10/2022', hora: '10:00' }, 1, 2), null);
  assert.equal(normalizarPontoExata({ nsr: 1, data: '02/10/2022', hora: '10:00' }, 1, 2), null);
  assert.equal(normalizarPontoExata({ nsr: 1, reppid: 2, data: 'xx' }, 1, 2), null);
});

test('divide período em blocos diários', () => {
  const dias = splitDiasExata('2022-10-01', '2022-10-03');
  assert.deepEqual(dias, [
    { inicio: '2022-10-01', fim: '2022-10-01' },
    { inicio: '2022-10-02', fim: '2022-10-02' },
    { inicio: '2022-10-03', fim: '2022-10-03' },
  ]);
  assert.throws(() => splitDiasExata('2022-10-03', '2022-10-01'), /maior ou igual/);
});

test('mapeia códigos de status da Exata para eventos locais', () => {
  assert.equal(mapStatusParaEvento('FERIAS'), 'Ferias');
  assert.equal(mapStatusParaEvento('Atestado Médico'), 'Atestado');
  assert.equal(mapStatusParaEvento('AFASTAMENTO INSS'), 'Afastado');
  assert.equal(mapStatusParaEvento('SUSPENSAO'), 'Suspensao');
  assert.equal(mapStatusParaEvento('LICENCA MATERNIDADE'), 'Licença Maternidade/ Paternidade');
  assert.equal(mapStatusParaEvento('Licença Nojo'), 'Licença Nojo');
  assert.equal(mapStatusParaEvento('ATIVO'), null);
  assert.equal(mapStatusParaEvento('DEMITIDO'), null);
});

test('mapeia empresa local por nome exato ou parcial único', () => {
  const empresas = [
    { id: 1, nome: 'DNP' },
    { id: 2, nome: 'São João' },
    { id: 3, nome: 'Mix Porto' },
  ];

  assert.equal(encontrarEmpresaLocal('DNP', empresas)?.id, 1);
  assert.equal(encontrarEmpresaLocal('SAO JOAO', empresas)?.id, 2);
  assert.equal(encontrarEmpresaLocal('DNP / São João', empresas), null);
  assert.equal(encontrarEmpresaLocal('Empresa desconhecida', empresas), null);
});

test('gera CSV de validação por empresa/dia com resumo e escape', () => {
  const csv = gerarCsvValidacao({
    resumo: { total: 3, funcionarios: 2, exportados: 2, pendentes: 1 },
    empresas: [
      {
        descricao: 'DNP; Matriz',
        empresasistema: 7,
        empresa_nome: 'DNP',
        dias: [
          {
            data: '2026-11-01',
            total: 2,
            funcionarios: 1,
            exportados: 2,
            pendentes: 0,
            repps: 1,
            primeiro_nsr: 10,
            ultimo_nsr: 11,
          },
          {
            data: '2026-11-02',
            total: 1,
            funcionarios: 1,
            exportados: 0,
            pendentes: 1,
            repps: 1,
            primeiro_nsr: 12,
            ultimo_nsr: 12,
          },
        ],
      },
      {
        descricao: 'Sem dados',
        empresasistema: 8,
        empresa_nome: null,
        dias: [],
      },
    ],
  });

  const linhas = csv.split('\r\n');
  assert.match(linhas[0], /Empresa Exata;empresasistema;Empresa local;Data/);
  assert.match(linhas[1], /^"DNP; Matriz";7;DNP;2026-11-01;2;1;2;0;1;10;11$/);
  assert.match(linhas[2], /2026-11-02;1;1;0;1;1;12;12$/);
  assert.match(linhas[3], /^Sem dados;8;Sem empresa local;;0;0;0;0;0;;$/);
  assert.match(linhas.at(-1), /^Total geral;;;;3;2;2;1$/);
});
