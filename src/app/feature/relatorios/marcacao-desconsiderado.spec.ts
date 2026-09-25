import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { Marcacao } from '../../models/marcacao/marcacao';

describe('MarcacaoService - pontos desconsiderados', () => {
  let svc: MarcacaoService;
  let http: HttpClient;

  beforeEach(async () => {
    const employeeService = {
      getEmployeeNamesBatch: vi.fn().mockResolvedValue([
        {
          matricula: '120000314',
          nome: 'Emp Teste',
          empresa: 'Empresa A',
          trabalha_sabado: 1,
          bate_ponto: 1,
          local: 'Local',
          cargo: 'Cargo',
        },
      ]),
      getAllActiveEmployees: vi.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: EmployeeService, useValue: employeeService }],
    }).compileComponents();

    svc = TestBed.inject(MarcacaoService);
    http = TestBed.inject(HttpClient);
  });

  function setupHttpMocks(ignoredPoints: any[]) {
    vi.spyOn(http, 'post').mockImplementation(((url: string) => {
      if (String(url).includes('/comments/batch')) return of({ success: true, comments: [] });
      if (String(url).includes('/marcacoes/manual/batch')) return of({ success: true, points: [] });
      if (String(url).includes('/employees/events/batch')) return of({ success: true, events: [] });
      if (String(url).includes('/marcacoes/desconsiderar/batch')) return of({ success: true, ignoredPoints });
      return of({ success: true });
    }) as any);
  }

  it('deve marcar ponto como desconsiderado com dados reais do banco (NSR + relogio)', async () => {
    // Linha real id=123 da tabela marcacao_desconsiderada
    setupHttpMocks([
      { matricula_funcionario: '120000314', data: '2026-08-23', marcacao_id: null, nsr: 2354351, relogio_ns: '00001.91401.094133' },
    ]);

    const m = new Marcacao({
      id: 999,
      cpf: '11122233344',
      dataMarcacao: new Date(2026, 7, 23, 12, 5),
      nsr: 2354351,
      numSerieRelogio: '00001.91401.094133',
      matriculaFuncionario: '120000314',
    });

    const dias = await svc.formatarMarcacoesPorDia([m], '23/08/2026', '23/08/2026', ['120000314']);

    console.log('DIAS:', JSON.stringify(dias.map(d => ({ data: d.data, status: d.getStatus(), horas: d.getHorasTrabalhadas() }))));
    console.log('MARCACOES:', JSON.stringify(dias[0]?.marcacoes.map(x => ({ nsr: x.nsr, serie: x.numSerieRelogio, desc: x.desconsiderado }))));

    const alvo = dias.flatMap(d => d.marcacoes).find(x => x.nsr === 2354351);
    expect(alvo?.desconsiderado).toBe(true);
  });

  it('nao deve desconsiderar outros pontos do mesmo relogio/dia', async () => {
    const employeeService = TestBed.inject(EmployeeService) as unknown as {
      getEmployeeNamesBatch: ReturnType<typeof vi.fn>;
    };
    employeeService.getEmployeeNamesBatch.mockResolvedValue([
      { matricula: '120000380', nome: 'Emp Teste', empresa: 'Empresa A', trabalha_sabado: 1, bate_ponto: 1, local: 'Local', cargo: 'Cargo' },
    ]);

    const REL = '00000.19140.743993';
    // Apenas o NSR 2397770 foi marcado para desconsiderar
    setupHttpMocks([
      { matricula_funcionario: '120000380', data: '2026-09-23', marcacao_id: null, nsr: 2397770, relogio_ns: REL, hora: null },
    ]);

    const marks = [
      new Marcacao({ id: 1, cpf: '11122233344', dataMarcacao: new Date(2026, 8, 23, 13, 12, 33), nsr: 2397718, numSerieRelogio: REL, matriculaFuncionario: '120000380' }),
      new Marcacao({ id: 2, cpf: '11122233344', dataMarcacao: new Date(2026, 8, 23, 13, 54, 6), nsr: 2397766, numSerieRelogio: REL, matriculaFuncionario: '120000380' }),
      new Marcacao({ id: 3, cpf: '11122233344', dataMarcacao: new Date(2026, 8, 23, 13, 56, 43), nsr: 2397770, numSerieRelogio: REL, matriculaFuncionario: '120000380' }),
    ];

    const dias = await svc.formatarMarcacoesPorDia(marks, '23/09/2026', '23/09/2026', ['120000380']);

    const flags = dias.flatMap(d => d.marcacoes).map(m => ({ nsr: m.nsr, desc: m.desconsiderado }));
    expect(flags).toEqual([
      { nsr: 2397718, desc: false },
      { nsr: 2397766, desc: false },
      { nsr: 2397770, desc: true },
    ]);
  });
});
