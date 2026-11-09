/**
 * Testes de integração com a conta real da ExataWeb.
 *
 * Executam apenas quando habilitados explicitamente, pois dependem de
 * credenciais e da disponibilidade da API externa:
 *
 *   EXATA_INTEGRATION=1 npm test
 *
 * A baixa (`baixaponto671`) altera o estado da conta e por isso exige uma
 * segunda habilitação:
 *
 *   EXATA_INTEGRATION=1 EXATA_INTEGRATION_BAIXA=1 npm test
 *
 * Nunca imprimem token, senha ou o conteúdo integral das respostas.
 */

const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // .env é opcional; as variáveis podem vir do ambiente.
}

const { createExataApi } = require('./exata-api');

const HABILITADO = process.env.EXATA_INTEGRATION === '1';
const HABILITADO_BAIXA = HABILITADO && process.env.EXATA_INTEGRATION_BAIXA === '1';
const MOTIVO_SKIP = 'Defina EXATA_INTEGRATION=1 para executar contra a conta real';

function hojeBr() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${agora.getFullYear()}`;
}

test(
  'integração real: login, empresas, funcionários e consulta de pontos',
  { skip: HABILITADO ? false : MOTIVO_SKIP },
  async () => {
    const api = createExataApi();

    const empresas = await api.listarEmpresas();
    assert.ok(Array.isArray(empresas), '/empresas deve retornar array');
    if (empresas.length === 0) return;

    const empresa = empresas[0];
    assert.ok(empresa.empresasistema !== undefined, 'empresa deve ter empresasistema');

    const funcionarios = await api.listarFuncionarios(empresa.empresasistema);
    assert.ok(Array.isArray(funcionarios), '/funcionarios deve retornar array');

    const status = await api.listarStatusFuncionarios(empresa.empresasistema);
    assert.ok(Array.isArray(status), '/status_funcionarios deve retornar array');

    const pontos = await api.buscarPontos({
      empresa: empresa.empresasistema,
      qtde: 10,
      dtInicial: hojeBr(),
      dtFinal: hojeBr(),
      status: 'N',
    });
    assert.ok(Array.isArray(pontos), '/pontos671 deve retornar array');
  }
);

test(
  'integração real: baixa dos pontos consultados',
  { skip: HABILITADO_BAIXA ? false : 'Defina também EXATA_INTEGRATION_BAIXA=1 para testar a baixa' },
  async () => {
    const api = createExataApi();

    const empresas = await api.listarEmpresas();
    assert.ok(Array.isArray(empresas));
    if (empresas.length === 0) return;

    const empresa = empresas[0];
    const pontos = await api.buscarPontos({
      empresa: empresa.empresasistema,
      qtde: 5,
      dtInicial: hojeBr(),
      dtFinal: hojeBr(),
      status: 'N',
    });
    assert.ok(Array.isArray(pontos));
    if (pontos.length === 0) return;

    const lote = pontos.slice(0, 5).map((ponto) => ({
      empresa: ponto.empresa ?? empresa.empresasistema,
      nsr: ponto.nsr,
      reppid: ponto.reppid,
    }));

    const resposta = await api.confirmarPontos(lote);
    assert.ok(resposta, 'baixa deve retornar resposta');
  }
);
