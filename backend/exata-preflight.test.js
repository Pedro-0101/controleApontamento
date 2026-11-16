const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatarRelatorio,
  statusGeral,
  resumirEmpresasExata,
  resumirMarcacoes,
  compararEmpresas,
  parseArgs,
} = require('./scripts/exata-preflight');

test('statusGeral prioriza FALHA e depois ATENCAO', () => {
  assert.equal(statusGeral([]), 'OK');
  assert.equal(statusGeral([{ status: 'OK' }, { status: 'ATENCAO' }]), 'ATENCAO');
  assert.equal(statusGeral([{ status: 'ATENCAO' }, { status: 'FALHA' }]), 'FALHA');
  assert.equal(statusGeral([{ status: 'OK' }]), 'OK');
});

test('resumirEmpresasExata conta mapeadas, sem mapeamento e inativas', () => {
  const resumo = resumirEmpresasExata([
    { empresa_id: 1, ativo: 1 },
    { empresa_id: null, ativo: 1 },
    { empresa_id: 3, ativo: 0 },
    { empresa_id: undefined, ativo: 1 },
  ]);

  assert.deepEqual(resumo, { total: 4, mapeadas: 2, semMapeamento: 2, inativas: 1 });
});

test('resumirMarcacoes separa exportadas, pendentes e sem status', () => {
  const resumo = resumirMarcacoes([
    { status_exportacao: 'S', total: 10 },
    { status_exportacao: 'N', total: 3 },
    { status_exportacao: null, total: 2 },
  ]);

  assert.deepEqual(resumo, { total: 15, exportadas: 10, pendentes: 3, outros: 2 });
});

test('compararEmpresas aponta diferenças entre API e banco', () => {
  const comparacao = compararEmpresas(
    [{ empresasistema: 1 }, { empresasistema: 2 }, { empresasistema: '3' }],
    [{ empresasistema: 2 }, { empresasistema: 3 }, { empresasistema: 4 }]
  );

  assert.equal(comparacao.api, 3);
  assert.equal(comparacao.banco, 3);
  assert.deepEqual(comparacao.ausentesNoBanco, [1]);
  assert.deepEqual(comparacao.ausentesNaApi, [4]);
});

test('parseArgs reconhece --json e --sem-api', () => {
  assert.deepEqual(parseArgs(['--json', '--sem-api']), { json: true, semApi: true });
  assert.deepEqual(parseArgs([]), { json: false, semApi: false });
});

test('formatarRelatorio mostra status, contadores e próximos passos', () => {
  const texto = formatarRelatorio({
    geradoEm: '2026-11-11T10:00:00.000Z',
    status: 'ATENCAO',
    checks: [
      { nome: 'Conexão com a Exata', status: 'OK', detalhe: '2 empresa(s) na conta' },
      { nome: 'Baixas pendentes', status: 'ATENCAO', detalhe: '3 marcação(ões) aguardando baixa' },
    ],
    empresas: { total: 2, mapeadas: 1, semMapeamento: 1, inativas: 0 },
    marcacoes: { total: 10, exportadas: 7, pendentes: 3, outros: 0 },
    execucoes: [
      { id: 9, tipo: 'EXATA_PONTOS_INCREMENTAL', status: 'CONCLUIDO', empresas_processadas: 2 },
    ],
    proximosPassos: ['Mapear as empresas sem empresa local'],
  });

  assert.match(texto, /Status geral: ATENCAO/);
  assert.match(texto, /\[OK\] Conexão com a Exata/);
  assert.match(texto, /\[ATENÇÃO\] Baixas pendentes/);
  assert.match(texto, /Empresas: 2 no banco \| 1 mapeadas/);
  assert.match(texto, /Marcações Exata: 10 no total \| 7 exportadas \| 3 pendentes/);
  assert.match(texto, /#9 EXATA_PONTOS_INCREMENTAL CONCLUIDO/);
  assert.match(texto, /Mapear as empresas sem empresa local/);
});
