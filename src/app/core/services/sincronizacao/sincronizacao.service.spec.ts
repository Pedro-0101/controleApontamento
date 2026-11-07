import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { SincronizacaoService } from './sincronizacao.service';

describe('SincronizacaoService', () => {
  let service: SincronizacaoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(SincronizacaoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('envia os filtros da sincronização e devolve o resumo', async () => {
    const promise = service.executar({
      empresaConfigIds: [3],
      recursos: ['funcionarios', 'relogios'],
    });

    const request = httpMock.expectOne('/api/sincronizacao/executar');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.empresaConfigIds).toEqual([3]);
    expect(request.request.body.recursos).toEqual(['funcionarios', 'relogios']);

    request.flush({
      success: true,
      execucaoId: 10,
      status: 'CONCLUIDO',
      duracaoMs: 120,
      empresas: [{
        empresa_config_id: 3,
        nome: 'Mix Porto',
        empresa_padrao: 'Mix Porto Feliz',
        funcionarios: {
          inseridos: 2, atualizados: 1, inalterados: 0,
          ignorados: 0, statusDivergentes: 0, semEmpresa: 0,
        },
        relogios: {
          inseridos: 1, atualizados: 0, inalterados: 9,
          ignorados: 0, statusDivergentes: 0, semEmpresa: 0,
        },
        erro: null,
      }],
    });

    const resultado = await promise;
    expect(resultado.status).toBe('CONCLUIDO');
    expect(resultado.empresas[0].funcionarios?.inseridos).toBe(2);
  });

  it('consulta o histórico de execuções', async () => {
    const promise = service.historico(5);

    const request = httpMock.expectOne('/api/sincronizacao/historico?limit=5');
    request.flush({
      success: true,
      historico: [{
        id: 1,
        tipo: 'TUDO',
        status: 'CONCLUIDO',
        usuario: null,
        iniciado_em: '2026-11-07T13:00:00.000Z',
        finalizado_em: '2026-11-07T13:00:01.000Z',
        duracao_ms: 1000,
        empresas_processadas: 2,
        resumo: null,
        erro: null,
      }],
    });

    const historico = await promise;
    expect(historico).toHaveLength(1);
    expect(historico[0].empresas_processadas).toBe(2);
  });
});
