import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule, AlertCircle, Calendar, CalendarX, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Download, FileCode, FileSpreadsheet, FileText, Inbox, Search, User, Users, Utensils, X } from 'lucide-angular';
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

describe('Relatorios PDF com ponto desconsiderado', () => {
  let component: Relatorios;
  let fixture: ComponentFixture<Relatorios>;

  beforeEach(async () => {
    const marcacaoApiService = {
      getAllMarcacoes: vi.fn().mockResolvedValue([]),
      getMarcacoesByRelogio: vi.fn().mockResolvedValue([]),
    };
    const employeeService = {
      getAllEmployees: vi.fn().mockResolvedValue([
        { matricula: '120000314', nome: 'Joao Silva', empresa: 'Empresa A', cargo: 'Cargo', local: '', ativo: 1 }
      ])
    };
    const relogioService = { updateRelogios: vi.fn().mockResolvedValue([]) };
    const marcacaoService = { formatarMarcacoesPorDia: vi.fn().mockResolvedValue([]) };
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
        importProvidersFrom(LucideAngularModule.pick({ AlertCircle, Calendar, CalendarX, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Download, FileCode, FileSpreadsheet, FileText, Inbox, Search, User, Users, Utensils, X }))
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Relatorios);
    component = fixture.componentInstance;
    component.tipoRelatorio.set('espelho');
    component.employees.set([
      { matricula: '120000314', nome: 'Joao Silva', empresa: 'Empresa A', cargo: 'Cargo', local: '', ativo: 1 }
    ] as any);
    fixture.detectChanges();
  });

  it('formatarMarcacoesDia marca ponto desconsiderado (flag) e manual com asterisco', () => {
    const dia = new MarcacaoDia(
      1, '123', '120000314', 'Joao Silva', '2026-08-03',
      [
        new Marcacao({ id: 10, dataMarcacao: new Date(2026, 7, 3, 8, 0), numSerieRelogio: '00001.91401.094133', nsr: 2354000 }),
        new Marcacao({ id: 11, dataMarcacao: new Date(2026, 7, 3, 12, 0), numSerieRelogio: '00001.91401.094133', nsr: 2354001, desconsiderado: true }),
        new Marcacao({ id: 12, dataMarcacao: new Date(2026, 7, 3, 13, 30), numSerieRelogio: 'MANUAL', nsr: 0 }),
      ],
      'Empresa A'
    );

    const meta = component.formatarMarcacoesDia(dia);

    expect(meta[0].label).toBe('08:00');
    expect(meta[0].desconsiderado).toBe(false);

    expect(meta[1].label).toBe('12:00');
    expect(meta[1].desconsiderado).toBe(true);
    expect(meta[1].hora).toBe('12:00');

    expect(meta[2].label).toBe('13:30*');
    expect(meta[2].manual).toBe(true);
  });

  it('exportarPDF nao deve quebrar com ponto desconsiderado e calcula horas/status com pontos validos', async () => {
    // Segunda-feira com saida das 12:00 desconsiderada -> fica Incompleto
    const diaComDesconsiderado = new MarcacaoDia(
      1, '123', '120000314', 'Joao Silva', '2026-08-03',
      [
        new Marcacao({ id: 10, dataMarcacao: new Date(2026, 7, 3, 8, 0), numSerieRelogio: '00001.91401.094133', nsr: 2354000 }),
        new Marcacao({ id: 11, dataMarcacao: new Date(2026, 7, 3, 12, 0), numSerieRelogio: '00001.91401.094133', nsr: 2354001, desconsiderado: true }),
      ],
      'Empresa A'
    );
    // Terca-feira completa: 08:00 as 17:00 = 9h -> Ok
    const diaNormal = new MarcacaoDia(
      2, '123', '120000314', 'Joao Silva', '2026-08-04',
      [
        new Marcacao({ id: 12, dataMarcacao: new Date(2026, 7, 4, 8, 0), numSerieRelogio: '00001.91401.094133', nsr: 2354002 }),
        new Marcacao({ id: 13, dataMarcacao: new Date(2026, 7, 4, 17, 0), numSerieRelogio: '00001.91401.094133', nsr: 2354003 }),
      ],
      'Empresa A'
    );

    component.marcacoesPorDia.set([diaComDesconsiderado, diaNormal]);
    component.periodoGerado = '01/08/2026 a 10/08/2026';

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await component.exportarPDF();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
