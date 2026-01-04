import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TitleCasePipe } from '@angular/common';
import { DateHelper } from '../../../../core/helpers/dateHelper';
import { LoggerService } from '../../../../core/services/logger/logger.service';
import { AdmUnit } from '../../../../models/admUnit/adm-unit';
import { AdmUnitService } from '../../../../core/services/admUnits/adm-unit.service';
import { MarcacaoService } from '../../../../core/services/marcacao/marcacao.service';
import { TabelaFuncionarios } from '../tabela-funcionarios';

@Component({
  selector: 'app-filtros-tabela-marcacoes',
  imports: [LucideAngularModule, TitleCasePipe],
  templateUrl: './filtros-tabela-marcacoes.html',
  styleUrl: './filtros-tabela-marcacoes.css',
})
export class FiltrosTabelaMarcacoes {

  // Services
  private loggerService = inject(LoggerService);
  private admUnitService = inject(AdmUnitService);
  private marcacaoService = inject(MarcacaoService);

  // Signal loading marcacoes
  protected readonly _isLoadingMarcacoesFiltroPainel = this.marcacaoService._isLoadingMarcacoes;

  // Signals unidades
  private unidadesFiltroPainel = signal<AdmUnit[]>([]);
  private unidadeSelecionadaFiltroPainel = signal<AdmUnit | null>(null);
  private carregandoUnidadesFiltroPainel = signal<boolean>(true);

  // Signals data inicial e final
  private dataInicialFiltroPainel = signal<Date | null>(null);
  private dataFinalFiltroPainel = signal<Date | null>(null);

  // Signal status
  private statusPossiveisFiltroPainel = signal<string[]>(MarcacaoService.getPossiveisStatus());
  private statusSelecionadoFiltroPainel = signal<string | null>(null);

  // Computeds unidades
  readonly _unidadesFiltroPainel = computed(() => this.unidadesFiltroPainel());
  readonly _unidadeSelecionadaFiltroPainel = computed(() => this.unidadeSelecionadaFiltroPainel());
  readonly _carregandoUnidadesFiltroPainel = computed(() => this.carregandoUnidadesFiltroPainel());

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
  readonly _periodosPossiveisFiltroPainel = computed(() => this.possiveisPeriodos);

  ngOnInit() {
    this.loggerService.info('FiltroTabelaMarcacoesComponent', 'Componente inicializado');

    this.carregarUnidades();

    this.dataInicialFiltroPainel.set(null);
    this.dataFinalFiltroPainel.set(null);
    this.unidadeSelecionadaFiltroPainel.set(null);
    this.statusSelecionadoFiltroPainel.set(null);
  }

  private async carregarUnidades(): Promise<AdmUnit[]> {
    this.loggerService.info('FiltroTabelaMarcacoesComponent', 'Carregando unidades para o filtro do painel de marcações');

    this.carregandoUnidadesFiltroPainel.set(true);

    const unidades: AdmUnit[] = await this.admUnitService.getUnits();

    this.carregandoUnidadesFiltroPainel.set(false);
    this.unidadesFiltroPainel.set(unidades);
    return unidades;
  }

  public aoSelecionarUnidade(event: Event): void {
    const elementoSelect = event.target as HTMLSelectElement;
    const idSelecionado = parseInt(elementoSelect.value, 10);

    this.loggerService.info('FiltroTabelaMarcacoesComponent', `Unidade alterada para ID: ${idSelecionado}`);

    if (idSelecionado === 0) {
      this.unidadeSelecionadaFiltroPainel.set(null);
    } else {
      const unidadeEncontrada = this.unidadesFiltroPainel()
        .find(u => u.id === idSelecionado) || null;

      this.unidadeSelecionadaFiltroPainel.set(unidadeEncontrada);
    }
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

    const hoje = new Date();
    let dataInicio: Date | null = null;
    let dataFim: Date | null = null;

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
