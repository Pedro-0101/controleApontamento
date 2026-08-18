import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { vi } from 'vitest';
import { Relatorios } from './relatorios';
import { MarcacaoApiService } from '../../core/services/marcacao-api/marcacao-api.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { RelogioService } from '../../core/services/relogio/relogio.service';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { AdmUnitService } from '../../core/services/admUnits/adm-unit.service';
import { Marcacao } from '../../models/marcacao/marcacao';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';

function mockDia(matricula: string, nome: string, data: string, evento?: string): MarcacaoDia {
  const dia = new MarcacaoDia(1, '123', matricula, nome, data, [], 'Empresa Teste', true, undefined, 'Local Teste', 'Cargo');
  if (evento) dia.evento = evento;
  return dia;
}

describe('Relatorios', () => {
  let component: Relatorios;
  let fixture: ComponentFixture<Relatorios>;

  beforeEach(async () => {
    const marcacaoApiService = {
      getAllMarcacoes: vi.fn().mockResolvedValue([] as Marcacao[]),
      getMarcacoesByRelogio: vi.fn().mockResolvedValue([] as Marcacao[]),
      getMarcacoesByEmployee: vi.fn().mockResolvedValue([] as Marcacao[]),
    };
    const employeeService = { getAllEmployees: vi.fn().mockResolvedValue([]) };
    const relogioService = { updateRelogios: vi.fn().mockResolvedValue([]) };
    const marcacaoService = { formatarMarcacoesPorDia: vi.fn().mockResolvedValue([] as MarcacaoDia[]) };
    const toastService = { warning: vi.fn() };
    const admUnitService = { getUnits: vi.fn().mockResolvedValue([]) };

    await TestBed.configureTestingModule({
      imports: [Relatorios],
      providers: [
        { provide: MarcacaoApiService, useValue: marcacaoApiService },
        { provide: EmployeeService, useValue: employeeService },
        { provide: RelogioService, useValue: relogioService },
        { provide: MarcacaoService, useValue: marcacaoService },
        { provide: ToastService, useValue: toastService },
        { provide: AdmUnitService, useValue: admUnitService },
        importProvidersFrom(LucideAngularModule.pick({} as any))
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Relatorios);
    component = fixture.componentInstance;
    component.tipoRelatorio.set('faltas');
    component.dataInicio.set('2026-08-01');
    component.dataFim.set('2026-08-10');
    fixture.detectChanges();
  });

  it('deve criar', () => {
    expect(component).toBeTruthy();
  });

  it('calcula faltas confirmadas por funcionario', () => {
    const dias = [
      mockDia('1', 'Joao Silva', '2026-08-01', 'Falta Confirmada'),
      mockDia('1', 'Joao Silva', '2026-08-02', 'Falta Confirmada'),
      mockDia('1', 'Joao Silva', '2026-08-03', 'Ok'),
      mockDia('2', 'Maria Souza', '2026-08-01', 'Falta Confirmada'),
      mockDia('2', 'Maria Souza', '2026-08-02', 'Ok'),
    ];
    component.marcacoesPorDia.set(dias);

    component.calcularFaltasConfirmadas();

    const r = component.resultadosFaltas();
    expect(r.length).toBe(2);
    expect(r[0].matricula).toBe('1');
    expect(r[0].quantidadeFaltas).toBe(2);
    expect(r[1].matricula).toBe('2');
    expect(r[1].quantidadeFaltas).toBe(1);
  });

  it('renderiza a tabela de faltas apos gerar relatorio', async () => {
    const marcacaoService = TestBed.inject(MarcacaoService) as unknown as {
      formatarMarcacoesPorDia: ReturnType<typeof vi.fn>;
    };
    marcacaoService.formatarMarcacoesPorDia.mockResolvedValue([
      mockDia('1', 'Joao Silva', '2026-08-01', 'Falta Confirmada'),
      mockDia('2', 'Maria Souza', '2026-08-01', 'Falta Confirmada'),
    ]);

    await component.gerarRelatorio();
    fixture.detectChanges();

    expect(component.hasGenerated()).toBe(true);
    expect(component.resultadosFaltas().length).toBe(2);

    const table = fixture.nativeElement.querySelector('table');
    const rows = table ? table.querySelectorAll('tbody tr') : [];
    expect(rows.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Joao Silva');
  });
});
