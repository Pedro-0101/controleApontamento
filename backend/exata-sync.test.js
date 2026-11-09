const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizarFuncionario,
  parseDateOnly,
  parseDateTime,
  encontrarEmpresaLocal,
  matriculaToString,
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
