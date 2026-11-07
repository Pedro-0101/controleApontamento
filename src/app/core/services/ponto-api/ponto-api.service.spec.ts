import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { PontoApiService } from './ponto-api.service';
import { ApiSessionService, CompanyToken } from '../apiSession/api-session.service';

const company: CompanyToken = {
  id: 1,
  nome: 'Empresa Teste',
  token: 'token-antigo',
  erro: null,
};

describe('PontoApiService', () => {
  let service: PontoApiService;
  let httpMock: HttpTestingController;
  let sessionMock: {
    getCompanies: () => CompanyToken[];
    getCompanyById: (id: number) => CompanyToken | undefined;
    isTokenErrorMessage: (value: unknown) => boolean;
    refresh: () => Promise<boolean>;
  };

  beforeEach(() => {
    sessionMock = {
      getCompanies: () => [company],
      getCompanyById: (id: number) =>
        id === company.id ? { ...company, token: 'token-novo' } : undefined,
      isTokenErrorMessage: (value: unknown) =>
        typeof value === 'string' && value.toLowerCase().includes('expirado'),
      refresh: async () => true,
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ApiSessionService, useValue: sessionMock },
      ],
    });

    service = TestBed.inject(PontoApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('renova o token e repete a operação uma vez quando a API informa expiração', async () => {
    const promise = service.postForCompany(
      'SelecionaMarcacoes',
      { dataInicio: '01/01/2026' },
      company
    );

    const first = httpMock.expectOne('/api/SelecionaMarcacoes');
    expect(first.request.body.tokenAcesso).toBe('token-antigo');
    first.flush({ d: 'Token expirado' });

    // Deixa o refresh assíncrono concluir antes da segunda requisição.
    await new Promise(resolve => setTimeout(resolve, 0));

    const second = httpMock.expectOne('/api/SelecionaMarcacoes');
    expect(second.request.body.tokenAcesso).toBe('token-novo');
    second.flush({ d: [{ id: 10 }] });

    await expect(promise).resolves.toEqual({ d: [{ id: 10 }] });
  });

  it('não repete a operação quando o token é válido', async () => {
    const promise = service.postForCompany(
      'RetornaRelogiosInfo',
      { datainicio: '01/01/2026' },
      company
    );

    const request = httpMock.expectOne('/api/RetornaRelogiosInfo');
    request.flush({ d: [{ NumSerieRelogio: '123' }] });

    await expect(promise).resolves.toEqual({ d: [{ NumSerieRelogio: '123' }] });
    httpMock.expectNone('/api/RetornaRelogiosInfo');
  });

  it('lança erro descritivo se não for possível renovar o token', async () => {
    sessionMock.refresh = async () => false;

    const promise = service.postForCompany(
      'ListarUnidadeAdministrativa',
      {},
      company
    );

    httpMock.expectOne('/api/ListarUnidadeAdministrativa').flush({ d: 'Token expirado' });

    await expect(promise).rejects.toThrow(
      'Não foi possível renovar o token da empresa Empresa Teste'
    );
  });
});
