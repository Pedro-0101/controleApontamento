const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createExataApi,
  formatDateBr,
  tokenExpiresAt,
  ExataApiError,
} = require('./exata-api');

function jwt(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS512' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'teste', exp: expSeconds })).toString('base64url');
  return `${header}.${payload}.assinatura`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain' },
  });
}

function criarApi(fetchImpl) {
  return createExataApi({
    baseUrl: 'https://exata.exemplo.com',
    user: 'usuario',
    password: 'segredo',
    timeoutMs: 5000,
    fetchImpl,
  });
}

test('login usa userName/password e reaproveita o token em cache', async () => {
  const token = jwt(Math.floor(Date.now() / 1000) + 3600);
  const chamadas = [];

  const api = criarApi(async (url, init) => {
    chamadas.push({ url, init });
    if (url.endsWith('/login')) return jsonResponse({ token });
    return jsonResponse([{ empresasistema: 1, descricao: 'Empresa A' }]);
  });

  const empresas = await api.listarEmpresas();
  assert.equal(empresas.length, 1);

  await api.listarEmpresas();

  assert.equal(chamadas.length, 3, 'login + duas consultas');
  assert.equal(chamadas[0].url, 'https://exata.exemplo.com/login');
  assert.deepEqual(JSON.parse(chamadas[0].init.body), {
    userName: 'usuario',
    password: 'segredo',
  });
  assert.equal(chamadas[1].init.headers.Authorization, `Bearer ${token}`);
  assert.equal(chamadas[2].init.headers.Authorization, `Bearer ${token}`);
});

test('renova o token uma única vez em 401', async () => {
  const tokenAntigo = jwt(Math.floor(Date.now() / 1000) + 3600);
  const tokenNovo = jwt(Math.floor(Date.now() / 1000) + 7200);
  const autorizacoes = [];
  let logins = 0;
  let consultas = 0;

  const api = criarApi(async (url, init) => {
    if (url.endsWith('/login')) {
      logins++;
      return jsonResponse({ token: logins === 1 ? tokenAntigo : tokenNovo });
    }

    consultas++;
    autorizacoes.push(init.headers.Authorization);
    if (consultas === 1) return textResponse('não autorizado', 401);
    return jsonResponse([]);
  });

  const resultado = await api.listarEmpresas();

  assert.deepEqual(resultado, []);
  assert.equal(logins, 2);
  assert.deepEqual(autorizacoes, [
    `Bearer ${tokenAntigo}`,
    `Bearer ${tokenNovo}`,
  ]);
});

test('erro 400 com array preserva os detalhes por item', async () => {
  const token = jwt(Math.floor(Date.now() / 1000) + 3600);
  const detalhes = [
    { empresa: 1, nsr: 10, retorno: 'NSR inválido' },
    { empresa: 1, nsr: 11, retorno: 'Ponto já exportado' },
  ];

  const api = criarApi(async (url) => {
    if (url.endsWith('/login')) return jsonResponse({ token });
    return jsonResponse(detalhes, 400);
  });

  await assert.rejects(
    () => api.confirmarPontos([{ empresa: 1, nsr: 10, reppid: 2 }]),
    (error) => {
      assert.ok(error instanceof ExataApiError);
      assert.equal(error.status, 400);
      assert.deepEqual(error.details, detalhes);
      assert.match(error.message, /400/);
      assert.match(error.message, /NSR inválido/);
      return true;
    }
  );
});

test('erro 406 com corpo string é convertido em exceção legível', async () => {
  const token = jwt(Math.floor(Date.now() / 1000) + 3600);

  const api = criarApi(async (url) => {
    if (url.endsWith('/login')) return jsonResponse({ token });
    return textResponse('Campo empresa deve ser maior que 0', 406);
  });

  await assert.rejects(
    () => api.buscarPontos({ empresa: 0, dtInicial: '2026-11-09', dtFinal: '2026-11-09' }),
    (error) => {
      assert.equal(error.status, 406);
      assert.match(error.message, /406/);
      assert.match(error.message, /Campo empresa deve ser maior que 0/);
      return true;
    }
  );
});

test('buscarPontos envia o payload no formato da Portaria 671', async () => {
  const token = jwt(Math.floor(Date.now() / 1000) + 3600);
  let payloadEnviado = null;

  const api = criarApi(async (url, init) => {
    if (url.endsWith('/login')) return jsonResponse({ token });
    payloadEnviado = JSON.parse(init.body);
    return jsonResponse([]);
  });

  await api.buscarPontos({
    empresa: 7,
    qtde: 50,
    dtInicial: '2026-11-09',
    dtFinal: '09/11/2026',
  });

  assert.deepEqual(payloadEnviado, {
    empresa: 7,
    qtde: 50,
    dtInicial: '09/11/2026',
    dtFinal: '09/11/2026',
    status: 'N',
  });
});

test('falha com mensagem clara quando faltam credenciais', async () => {
  const api = createExataApi({
    baseUrl: '',
    user: '',
    password: '',
    fetchImpl: async () => jsonResponse({ token: 'x' }),
  });

  await assert.rejects(
    () => api.login(),
    /EXATA_API_BASE_URL, EXATA_API_USER e EXATA_API_PASSWORD/
  );
});

test('tokenExpiresAt lê o exp do JWT e ignora token inválido', () => {
  const exp = Math.floor(Date.now() / 1000) + 120;
  assert.equal(tokenExpiresAt(jwt(exp)), exp * 1000);
  assert.equal(tokenExpiresAt('token-invalido'), null);
});

test('formatDateBr aceita Date, AAAA-MM-DD e DD/MM/AAAA', () => {
  assert.equal(formatDateBr('2026-11-09'), '09/11/2026');
  assert.equal(formatDateBr('09/11/2026'), '09/11/2026');
  assert.equal(formatDateBr(new Date(2026, 10, 9)), '09/11/2026');
  assert.equal(formatDateBr('não é data'), null);
});
