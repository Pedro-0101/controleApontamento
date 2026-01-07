import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TitleCasePipe } from '@angular/common';
import { DateHelper } from '../../../../core/helpers/dateHelper';
import { LoggerService } from '../../../../core/services/logger/logger.service';
import { AdmUnit } from '../../../../models/admUnit/adm-unit';
import { MarcacaoService } from '../../../../core/services/marcacao/marcacao.service';
import { RelogioService } from '../../../../core/services/relogio/relogio.service';
import { Relogio } from '../../../../models/relogio/relogio';

@Component({
  selector: 'app-filtros-tabela-marcacoes',
  imports: [LucideAngularModule, TitleCasePipe],
  templateUrl: './filtros-tabela-marcacoes.html',
  styleUrl: './filtros-tabela-marcacoes.css',
})
export class FiltrosTabelaMarcacoes {

  // Services
  private loggerService = inject(LoggerService);
  private marcacaoService = inject(MarcacaoService);
  private relogioService = inject(RelogioService);

  // Signal loading marcacoes
  protected readonly _isLoadingMarcacoesFiltroPainel = this.marcacaoService._isLoadingMarcacoes;

  // Signals relogios
  private relogioSelecionadaFiltroPainel = signal<Relogio | null>(null);

  // Signals data inicial e final
  private dataInicialFiltroPainel = signal<string | null>(null);
  private dataFinalFiltroPainel = signal<string | null>(null);

  // Signal status
  private statusPossiveisFiltroPainel = signal<string[]>(MarcacaoService.getPossiveisStatus());
  private statusSelecionadoFiltroPainel = signal<string | null>(null);

  // Computeds relogios
  readonly _relogiosFiltroPainel = computed(() => this.relogioService._relogiosMarcacoes());
  readonly _relogioSelecionadaFiltroPainel = computed(() => this.relogioSelecionadaFiltroPainel());
  readonly _carregandoRelogioFiltroPainel = this.relogioService._loadingRelogios;

  // Computeds data inicial e final
  readonly _dataInicialFiltroPainel = computed(() => this.dataInicialFiltroPainel());
  readonly _dataFinalFiltroPainel = computed(() => this.dataFinalFiltroPainel());

  // Computed status
  readonly _statusPossiveisFiltroPainel = computed(() => this.statusPossiveisFiltroPainel());
  readonly _statusSelecionadoFiltroPainel = computed(() => this.statusSelecionadoFiltroPainel());

  private possiveisPeriodos: string[] = [
    'Hoje',
    'Ontem',
    'Últimos 7 dias',
    'Últimos 30 dias',
    'Este mês',
    'Mês passado',
  ];
  readonly _periodosPossiveisFiltroPainel = this.possiveisPeriodos;

  ngOnInit() {
    this.loggerService.info('FiltroTabelaMarcacoesComponent', 'Componente inicializado');

    this.dataInicialFiltroPainel.set(null);
    this.dataFinalFiltroPainel.set(null);
    this.relogioSelecionadaFiltroPainel.set(null);
    this.statusSelecionadoFiltroPainel.set(null);
  }

  public aoSelecionarRelogio(event: Event): void {
    const elementoSelect = event.target as HTMLSelectElement;
    const numSerieSelecionado = elementoSelect.value;
    
    if (numSerieSelecionado == 'todos') {
      this.relogioSelecionadaFiltroPainel.set(null);
      this.marcacaoService.filtrarMarcacoesPorRelogio(null);
      return;
    }

    const relogio = this.relogioService.getRelogioFromNumSerie(numSerieSelecionado);
    this.relogioSelecionadaFiltroPainel.set(relogio);
    
    this.marcacaoService.filtrarMarcacoesPorRelogio(relogio);
  }

  public aoSelecionarStatus(event: Event): void {
    const elementoSelect = event.target as HTMLSelectElement;
    const statusSelecionado = elementoSelect.value;

    this.loggerService.info('FiltroTabelaMarcacoesComponent', `Status alterado para: ${statusSelecionado}`);

    if (statusSelecionado === 'Todos') {
      this.statusSelecionadoFiltroPainel.set(null);
    } else {
      this.statusSelecionadoFiltroPainel.set(statusSelecionado);
      this.marcacaoService.filtrarMarcacoesPorStatus(statusSelecionado);
    }
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
      case 'Últimos 7 dias':
        const last7DaysRange = DateHelper.getLastNDaysRange(7);
        dataInicio = last7DaysRange.start;
        dataFim = last7DaysRange.end;
        break;
      case 'Últimos 30 dias':
        const last30DaysRange = DateHelper.getLastNDaysRange(30);
        dataInicio = last30DaysRange.start;
        dataFim = last30DaysRange.end;
        break;
      case 'Este mês':
        const thisMonthrange = DateHelper.getThisMonthRange();
        dataInicio = thisMonthrange.start;
        dataFim = thisMonthrange.end;
        break;
      case 'Mês passado':
        const lastMonthRange = DateHelper.getLastMonthRange();
        dataInicio = lastMonthRange.start;
        dataFim = lastMonthRange.end;
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
