import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { DateHelper } from '../../../../core/helpers/dateHelper';
import { LoggerService } from '../../../../core/services/logger/logger.service';
import { MarcacaoService } from '../../../../core/services/marcacao/marcacao.service';

import { MultiSelectDropdown } from '../../../../shared/multi-select-dropdown/multi-select-dropdown';

@Component({
  selector: 'app-filtros-tabela-marcacoes',
  imports: [LucideAngularModule, MultiSelectDropdown],
  templateUrl: './filtros-tabela-marcacoes.html',
  styleUrl: './filtros-tabela-marcacoes.css',
})
export class FiltrosTabelaMarcacoes {

  // Services
  private loggerService = inject(LoggerService);
  private marcacaoService = inject(MarcacaoService);

  // Signal loading marcacoes
  protected readonly _isLoadingMarcacoesFiltroPainel = this.marcacaoService._isLoadingMarcacoes;

  // Signals empresas
  protected empresasSelecionadas = signal<string[]>([]);
  readonly _empresasFiltroPainel = this.marcacaoService._empresasFiltroPainel;

  // Signals data inicial e final
  private dataInicialFiltroPainel = signal<string | null>(null);
  private dataFinalFiltroPainel = signal<string | null>(null);

  // Signals status
  protected statusSelecionados = signal<string[]>([]);
  readonly _statusFiltroComContagem = this.marcacaoService._statusFiltroComContagem;

  private possiveisPeriodos: string[] = [
    'Hoje',
    'Ontem',
    'Últimos 3 dias',
    'Últimos 7 dias',
    'Últimos 15 dias',
  ];
  readonly _periodosPossiveisFiltroPainel = this.possiveisPeriodos;

  ngOnInit() {
    this.loggerService.info('FiltroTabelaMarcacoesComponent', 'Componente inicializado');
    this.empresasSelecionadas.set([]);
    this.statusSelecionados.set([]);
  }

  public aoSelecionarEmpresa(empresas: string[]): void {
    this.empresasSelecionadas.set(empresas);
    this.marcacaoService.filtrarMarcacoesPorEmpresa(empresas);
  }

  public aoSelecionarStatus(status: string[]): void {
    this.statusSelecionados.set(status);
    this.marcacaoService.filtrarMarcacoesPorStatus(status);
  }

  public limparFiltros(): void {
    this.empresasSelecionadas.set([]);
    this.statusSelecionados.set([]);
    this.marcacaoService.filtrarMarcacoesPorEmpresa([]);
    this.marcacaoService.filtrarMarcacoesPorStatus([]);
  }

  public aoSelecionarPeriodo(event: Event): void {
    const elementoSelect = event.target as HTMLSelectElement;
    const opcao = elementoSelect.value;

    this.loggerService.info('FiltroTabelaMarcacoesComponent', `Data alterada para: ${opcao}`);

    let dataInicio: string | null = null;
    let dataFim: string | null = null;

    switch (opcao) {
      case 'Hoje':
        const todayRange = DateHelper.getTodayRange();
        dataInicio = todayRange.start;
        dataFim = todayRange.end;
        break;
      case 'Ontem':
        const yesterdayRange = DateHelper.getYesterdayRange();
        dataInicio = yesterdayRange.start;
        dataFim = yesterdayRange.end;
        break;
      case 'Últimos 3 dias':
        const last3DaysRange = DateHelper.getLastNDaysRange(3);
        dataInicio = last3DaysRange.start;
        dataFim = last3DaysRange.end;
        break;
      case 'Últimos 7 dias':
        const last7DaysRange = DateHelper.getLastNDaysRange(7);
        dataInicio = last7DaysRange.start;
        dataFim = last7DaysRange.end;
        break;
      case 'Últimos 15 dias':
        const last15DaysRange = DateHelper.getLastNDaysRange(15);
        dataInicio = last15DaysRange.start;
        dataFim = last15DaysRange.end;
        break;
      default:
        const todayRangeDefault = DateHelper.getTodayRange();
        dataInicio = todayRangeDefault.start;
        dataFim = todayRangeDefault.end;
        break;
    }

    this.dataInicialFiltroPainel.set(dataInicio);
    this.dataFinalFiltroPainel.set(dataFim);

    this.marcacaoService.updateMarcacoes(dataInicio, dataFim);

  }
}
