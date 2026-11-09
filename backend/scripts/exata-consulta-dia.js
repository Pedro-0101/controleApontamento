/**
 * Diagnóstico da ExataWeb: mostra quantos pontos a API devolve para um dia
 * (ou período), separados por status de exportação (N = pendentes, S = já
 * exportados) e paginando até o fim.
 *
 * Uso:
 *   node scripts/exata-consulta-dia.js [AAAA-MM-DD] [empresasistema]
 *
 * Sem argumentos, consulta o dia de hoje na primeira empresa da conta.
 * Nunca imprime token nem senha.
 */

const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // variáveis podem vir do ambiente
}

const { createExataApi, formatDateBr } = require('../exata-api');

function hojeIso() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

async function buscarTudo(api, empresa, data, status, qtde = 100) {
  const dt = formatDateBr(data);
  const todos = [];
  let pagina = 0;

  while (pagina < 100) {
    pagina++;
    const lote = await api.buscarPontos({
      empresa,
      qtde,
      dtInicial: dt,
      dtFinal: dt,
      status,
    });

    if (!Array.isArray(lote) || lote.length === 0) break;
    todos.push(...lote);
    if (lote.length < qtde) break;
  }

  return { total: todos.length, paginas: pagina, amostra: todos[0] || null };
}

async function main() {
  const data = process.argv[2] || hojeIso();
  const empresaArg = process.argv[3];

  const api = createExataApi();
  const empresas = await api.listarEmpresas();
  console.log(`Empresas na conta: ${Array.isArray(empresas) ? empresas.length : 0}`);

  if (!Array.isArray(empresas) || empresas.length === 0) {
    console.log('Nenhuma empresa encontrada.');
    return;
  }

  const empresa = empresaArg
    ? Number(empresaArg)
    : Number(empresas[0].empresasistema);

  console.log(`Consultando empresa ${empresa} em ${formatDateBr(data)}`);

  for (const status of ['N', 'S']) {
    try {
      const resultado = await buscarTudo(api, empresa, data, status);
      console.log(`status=${status} pontos=${resultado.total} paginas=${resultado.paginas}`);
      if (resultado.amostra) {
        console.log('  amostra:', {
          empresa: resultado.amostra.empresa,
          nsr: resultado.amostra.nsr,
          reppid: resultado.amostra.reppid,
          data: resultado.amostra.data,
          hora: resultado.amostra.hora,
          matricula: resultado.amostra.matricula,
        });
      }
    } catch (error) {
      console.log(`status=${status} ERRO: ${error?.message || error}`);
      if (error?.status) console.log('  HTTP status:', error.status);
    }
  }
}

main().catch((error) => {
  console.error('Falha:', error?.message || error);
  if (error?.status) console.error('HTTP status:', error.status);
  process.exitCode = 1;
});
