import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import {
  LucideAngularModule,
  LayoutDashboard,
  X,
  Users,
  CalendarX,
  TrendingUp,
  BarChart3,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-angular';
import { vi } from 'vitest';
import { Faltas } from './faltas';
import { MarcacaoApiService } from '../../core/services/marcacao-api/marcacao-api.service';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { Marcacao } from '../../models/marcacao/marcacao';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';

function mockDia(matricula: string, nome: string, data: string, evento?: string): MarcacaoDia {
  const dia = new MarcacaoDia(1, '123', matricula, nome, data, [], 'Empresa Teste', true, undefined, 'Local Teste', 'Cargo');
  if (evento) dia.evento = evento;
  return dia;
}

describe('Faltas', () => {
  let component: Faltas;
  let fixture: ComponentFixture<Faltas>;

  beforeEach(async () => {
    const marcacaoApiService = {
      getAllMarcacoes: vi.fn().mockResolvedValue([] as Marcacao[]),
    };
    const marcacaoService = { formatarMarcacoesPorDia: vi.fn().mockResolvedValue([] as MarcacaoDia[]) };
    const employeeService = { getAllEmployees: vi.fn().mockResolvedValue([]) };
    const toastService = { warning: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Faltas],
      providers: [
        { provide: MarcacaoApiService, useValue: marcacaoApiService },
        { provide: MarcacaoService, useValue: marcacaoService },
        { provide: EmployeeService, useValue: employeeService },
        { provide: ToastService, useValue: toastService },
        importProvidersFrom(LucideAngularModule.pick({
          LayoutDashboard,
          X,
          Users,
          CalendarX,
          TrendingUp,
          BarChart3,
          Building2,
          CheckCircle,
          ChevronDown,
          ChevronUp,
          ChevronLeft,
          ChevronRight,
          Search,
        }))
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Faltas);
    component = fixture.componentInstance;
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
      mockDia('3', 'Pedro Lima', '2026-08-01', 'Falta'),
    ];
    component.marcacoesPorDia.set(dias);

    component.calcularFaltas();

    const r = component.funcionariosFaltas();
    expect(r.length).toBe(2);
    expect(r[0].matricula).toBe('1');
    expect(r[0].faltas).toBe(2);
    expect(r[1].matricula).toBe('2');
    expect(r[1].faltas).toBe(1);
  });

  it('calcula os KPIs corretamente', () => {
    component.funcionariosFaltas.set([
      { matricula: '1', nome: 'Joao Silva', empresa: 'Empresa A', local: 'Local A', faltas: 6 },
      { matricula: '2', nome: 'Maria Souza', empresa: 'Empresa A', local: 'Local A', faltas: 4 },
      { matricula: '3', nome: 'Pedro Lima', empresa: 'Empresa B', local: 'Local B', faltas: 2 },
    ]);

    expect(component.numeroFuncionariosComFalta()).toBe(3);
    expect(component.totalFaltas()).toBe(12);
    expect(component.maiorNumeroFaltas()).toBe(6);
    expect(component.mediaFaltas()).toBe(4);
    expect(component.empresaComMaisFalta()?.nome).toBe('Empresa A');
    expect(component.empresaComMaisFalta()?.faltas).toBe(10);
  });

  it('classifica status por quantidade de faltas', () => {
    expect(component.statusFalta(0)).toBe('atencao');
    expect(component.statusFalta(2)).toBe('atencao');
    expect(component.statusFalta(3)).toBe('alerta');
    expect(component.statusFalta(5)).toBe('alerta');
    expect(component.statusFalta(6)).toBe('critico');
  });

  it('renderiza KPIs e tabela apos gerar dashboard', async () => {
    const marcacaoService = TestBed.inject(MarcacaoService) as unknown as {
      formatarMarcacoesPorDia: ReturnType<typeof vi.fn>;
    };
    marcacaoService.formatarMarcacoesPorDia.mockResolvedValue([
      mockDia('1', 'Joao Silva', '2026-08-01', 'Falta Confirmada'),
      mockDia('2', 'Maria Souza', '2026-08-01', 'Falta Confirmada'),
    ]);

    await component.gerarDashboard();
    fixture.detectChanges();

    expect(component.hasGenerated()).toBe(true);
    expect(component.funcionariosFaltas().length).toBe(2);

    const table = fixture.nativeElement.querySelector('table');
    const rows = table ? table.querySelectorAll('tbody tr') : [];
    expect(rows.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Joao Silva');
  });
});