/**
 * Script de fumaça da integração ExataWeb.
 *
 * Uso:
 *   node scripts/exata-smoke.js [empresasistema] [AAAA-MM-DD]
 *
 * Fluxo:
 *   1. login (implícito na primeira chamada)
 *   2. lista de empresas
 *   3. funcionários de uma empresa (a informada ou a primeira)
 *   4. status de funcionários da empresa
 *   5. pontos de um dia (hoje por padrão)
 *
 * Nunca imprime token nem senha.
 */

const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // .env é opcional; as variáveis podem vir do ambiente.
}

const { createExataApi, formatDateBr } = require('../exata-api');

function hojeIso() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function resumirPontos(pontos) {
  if (!Array.isArray(pontos)) return { total: 0, amostra: null };
  const amostra = pontos[0]
    ? {
        empresa: pontos[0].empresa,
        nsr: pontos[0].nsr,
        reppid: pontos[0].reppid,
        data: pontos[0].data,
        hora: pontos[0].hora,
        matricula: pontos[0].matricula,
        tipoColetor: pontos[0].tipoColetor,
      }
    : null;
  return { total: pontos.length, amostra };
}

async function main() {
  const empresaArg = process.argv[2];
  const dataArg = process.argv[3] || hojeIso();
  const dtInicial = formatDateBr(dataArg);
  const dtFinal = formatDateBr(dataArg);

  if (!dtInicial) {
    throw new Error('Data inválida. Use AAAA-MM-DD ou DD/MM/AAAA.');
  }

  const api = createExataApi();

  console.log('Autenticando na ExataWeb...');
  const empresas = await api.listarEmpresas();
  if (!Array.isArray(empresas)) {
    throw new Error('Resposta inesperada de /empresas (esperado array)');
  }
  console.log(`Empresas encontradas: ${empresas.length}`);
  for (const empresa of empresas) {
    console.log(
      `  - empresasistema=${empresa.empresasistema} | ${empresa.descricao || '(sem descrição)'}`
    );
  }

  if (empresas.length === 0) {
    console.log('Nenhuma empresa na conta; encerrando.');
    return;
  }

  const alvo = empresaArg
    ? empresas.find((e) => String(e.empresasistema) === String(empresaArg))
    : empresas[0];

  if (!alvo) {
    throw new Error(`Empresa ${empresaArg} não encontrada na conta Exata`);
  }

  console.log(`\nFuncionários da empresa ${alvo.empresasistema}...`);
  const funcionarios = await api.listarFuncionarios(alvo.empresasistema);
  console.log(`Funcionários encontrados: ${Array.isArray(funcionarios) ? funcionarios.length : 0}`);
  if (Array.isArray(funcionarios) && funcionarios[0]) {
    const f = funcionarios[0];
    console.log(
      `  Amostra: matricula=${f.matricula} | nome=${f.nome} | status=${f.status ?? '-'}`
    );
  }

  console.log(`\nStatus de funcionários da empresa ${alvo.empresasistema}...`);
  const status = await api.listarStatusFuncionarios(alvo.empresasistema);
  console.log(`Status encontrados: ${Array.isArray(status) ? status.length : 0}`);

  console.log(`\nPontos de ${dtInicial} (status N) na empresa ${alvo.empresasistema}...`);
  const pontos = await api.buscarPontos({
    empresa: alvo.empresasistema,
    qtde: 100,
    dtInicial,
    dtFinal,
    status: 'N',
  });
  const resumo = resumirPontos(pontos);
  console.log(`Pontos encontrados: ${resumo.total}`);
  if (resumo.amostra) console.log('  Amostra:', resumo.amostra);

  console.log('\nSmoke test concluído com sucesso.');
}

main().catch((error) => {
  console.error('\nFalha no smoke test:', error?.message || error);
  if (error?.status) console.error('HTTP status:', error.status);
  if (error?.details) {
    try {
      console.error('Detalhes:', JSON.stringify(error.details).slice(0, 2000));
    } catch {
      console.error('Detalhes indisponíveis');
    }
  }
  process.exitCode = 1;
});
