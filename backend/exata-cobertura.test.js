/**
 * Testes da classificação de cobertura entre os funcionários retornados pela
 * Exata e o cadastro local (`qrcod_2023`). Não usam banco.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classificarCoberturaFuncionario,
  gerarCsvCoberturaFuncionarios,
} = require('./exata-sync');

function local(overrides = {}) {
  return {
    id: 10,
    matricula: '000123',
    empresa_id: 3,
    empresa: 'EMPRESA LOCAL',
    nome: 'JOSE DA SILVA',
    cargo: 'OPERADOR',
    local: 'FABRICA',
    ativo: 1,
    origem_exata: 0,
    data_admissao: '2024-01-01',
    ...overrides,
  };
}

function funcionario(overrides = {}) {
  return {
    matricula: '000123',
    nome: 'JOSE DA SILVA',
    status: 'S',
    admissao: '2024-01-01',
    ...overrides,
  };
}

const EMPRESA = { empresa_id: 3, descricao: 'EMPRESA EXATA', empresasistema: 7 };

test('classifica como CADASTRADO quando a matrícula está na mesma empresa', () => {
  const resultado = classificarCoberturaFuncionario(funcionario(), EMPRESA, [local()]);
  assert.equal(resultado.situacao_cadastro, 'CADASTRADO');
  assert.deepEqual(resultado.alertas, []);
  assert.equal(resultado.cadastro_local.id, 10);
});

test('classifica como OUTRA_EMPRESA quando a matrícula está em outra empresa', () => {
  const resultado = classificarCoberturaFuncionario(funcionario(), EMPRESA, [
    local({ empresa_id: 9, empresa: 'OUTRA EMPRESA' }),
  ]);
  assert.equal(resultado.situacao_cadastro, 'OUTRA_EMPRESA');
});

test('classifica como CADASTRADO_SEM_EMPRESA quando empresa_id é nulo', () => {
  const resultado = classificarCoberturaFuncionario(funcionario(), EMPRESA, [
    local({ empresa_id: null, empresa: null }),
  ]);
  assert.equal(resultado.situacao_cadastro, 'CADASTRADO_SEM_EMPRESA');
  assert.ok(resultado.alertas.includes('empresa_local_nula'));
});

test('classifica como NAO_CADASTRADO quando não há linha local', () => {
  const resultado = classificarCoberturaFuncionario(funcionario(), EMPRESA, []);
  assert.equal(resultado.situacao_cadastro, 'NAO_CADASTRADO');
  assert.equal(resultado.cadastro_local, null);
});

test('classifica como EMPRESA_NAO_MAPEADA quando a empresa da Exata não tem empresa local', () => {
  const resultado = classificarCoberturaFuncionario(funcionario(), { empresa_id: null }, [local()]);
  assert.equal(resultado.situacao_cadastro, 'EMPRESA_NAO_MAPEADA');
  assert.equal(resultado.cadastro_local.id, 10);
});

test('classifica como AMBIGUO quando há mais de uma linha local', () => {
  const resultado = classificarCoberturaFuncionario(funcionario(), EMPRESA, [
    local({ id: 1 }),
    local({ id: 2, nome: 'JOSE DA SILVA 2' }),
  ]);
  assert.equal(resultado.situacao_cadastro, 'AMBIGUO');
  assert.ok(resultado.alertas.includes('duplicado'));
});

test('sinaliza inativo, nome divergente, empresa nula e espelho da Exata', () => {
  const resultado = classificarCoberturaFuncionario(
    funcionario({ nome: 'JOSÉ DA SILVA' }),
    EMPRESA,
    [local({
      ativo: 0,
      empresa_id: null,
      nome: 'JOSE SILVA',
      cargo: null,
      local: null,
      origem_exata: 1,
      data_admissao: null,
    })]
  );

  assert.equal(resultado.situacao_cadastro, 'CADASTRADO_SEM_EMPRESA');
  assert.ok(resultado.alertas.includes('inativo_local'));
  assert.ok(resultado.alertas.includes('nome_divergente'));
  assert.ok(resultado.alertas.includes('empresa_local_nula'));
  assert.ok(resultado.alertas.includes('possivel_espelho'));
});

test('não sinaliza espelho quando origem_exata é 0, mesmo com cadastro incompleto', () => {
  const resultado = classificarCoberturaFuncionario(
    funcionario(),
    EMPRESA,
    [local({
      cargo: null,
      local: null,
      origem_exata: 0,
      data_admissao: null,
    })]
  );

  assert.equal(resultado.situacao_cadastro, 'CADASTRADO');
  assert.ok(!resultado.alertas.includes('possivel_espelho'));
});

test('CSV de cobertura inclui cabeçalho, linhas e resumo', () => {
  const csv = gerarCsvCoberturaFuncionarios({
    resumo: {
      total: 1,
      porSituacao: {
        CADASTRADO: 1,
        CADASTRADO_SEM_EMPRESA: 0,
        OUTRA_EMPRESA: 0,
        AMBIGUO: 0,
        NAO_CADASTRADO: 0,
        EMPRESA_NAO_MAPEADA: 0,
      },
      alertas: {
        inativo_local: 0,
        nome_divergente: 0,
        possivel_espelho: 0,
        duplicado: 0,
        empresa_local_nula: 0,
      },
    },
    funcionarios: [{
      matricula: '000123',
      nome_exata: 'JOSE DA SILVA',
      empresa_exata: 'EMPRESA EXATA',
      empresasistema: 7,
      situacao_cadastro: 'CADASTRADO',
      alertas: [],
      cadastro_local: local(),
    }],
  });

  assert.match(csv, /Matrícula;Nome Exata;Empresa Exata/);
  assert.match(csv, /000123;JOSE DA SILVA;EMPRESA EXATA;7;CADASTRADO/);
  assert.match(csv, /CADASTRADO;1/);
});
