const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizarDados,
  formatarLogExata,
  criarLoggerExata,
  metricasPontos,
  sanitizarTexto,
} = require('./exata-observability');

test('sanitiza dados sensíveis e remove campos vazios', () => {
  const dados = sanitizarDados({
    empresa_config_id: 1,
    empresasistema: 7,
    token: 'jwt-secreto',
    password: 'segredo',
    Authorization: 'Bearer abc',
    buscados: 10,
    erro: '',
    vazio: null,
  });

  assert.deepEqual(dados, {
    empresa_config_id: 1,
    empresasistema: 7,
    token: '[redacted]',
    password: '[redacted]',
    Authorization: '[redacted]',
    buscados: 10,
  });
});

test('trunca valores longos para não poluir o log', () => {
  const dados = sanitizarDados({ erro: 'x'.repeat(400) });
  assert.equal(dados.erro.length, 303);
  assert.match(dados.erro, /\.\.\.$/);
});

test('monta linha de log com operação, contexto e contadores', () => {
  const linha = formatarLogExata('pontos.empresa', {
    empresa_config_id: 3,
    empresasistema: 11,
    buscados: 50,
    baixados: 50,
    erros: 0,
  });

  assert.equal(
    linha,
    '[Exata] pontos.empresa empresa_config_id=3 empresasistema=11 buscados=50 baixados=50 erros=0'
  );
});

test('logger injetável escreve uma linha por operação', () => {
  const linhas = [];
  const log = criarLoggerExata({ consoleImpl: { log: (linha) => linhas.push(linha) } });

  log('funcionarios.inicio', { empresa_config_id: 1, usuario: '-' });
  log('funcionarios.fim', { empresa_config_id: 1, inseridos: 2 });

  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /^\[Exata\] funcionarios\.inicio empresa_config_id=1 usuario=-$/);
  assert.match(linhas[1], /inseridos=2/);
});

test('métricas de pontos padronizam persistidos e erros', () => {
  assert.deepEqual(
    metricasPontos({
      buscados: '10',
      inseridos: 4,
      atualizados: 3,
      ignorados: 1,
      baixados: 6,
      errosBaixa: 2,
    }),
    {
      buscados: 10,
      inseridos: 4,
      atualizados: 3,
      persistidos: 7,
      ignorados: 1,
      baixados: 6,
      erros: 2,
    }
  );

  assert.deepEqual(metricasPontos({ buscados: 5, erros: 1 }), {
    buscados: 5,
    inseridos: 0,
    atualizados: 0,
    persistidos: 0,
    ignorados: 0,
    baixados: 0,
    erros: 1,
  });
});

test('sanitizarTexto mascara segredos conhecidos em mensagens livres', () => {
  const texto = sanitizarTexto('falha ao usar Bearer abc123 e senha super-secreta', [
    'abc123',
    'super-secreta',
  ]);
  assert.equal(texto, 'falha ao usar Bearer *** e senha ***');
});
