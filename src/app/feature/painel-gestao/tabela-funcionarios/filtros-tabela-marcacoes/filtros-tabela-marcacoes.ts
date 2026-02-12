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

  // Signal loading marcacoes
  protected readonly _isLoadingMarcacoesFiltroPainel = this.marcacaoService._isLoadingMarcacoes;

  // Signals empresas
  private empresaSelecionadaFiltroPainel = signal<string | null>(null);

  // Signals data inicial e final
  private dataInicialFiltroPainel = signal<string | null>(null);
  private dataFinalFiltroPainel = signal<string | null>(null);

  // Signal status
  private statusPossiveisFiltroPainel = signal<string[]>(MarcacaoService.getPossiveisStatus());
  private statusSelecionadoFiltroPainel = signal<string | null>(null);

  // Computeds empresas
  readonly _empresasFiltroPainel = this.marcacaoService._empresasFiltroPainel;
  readonly _empresaSelecionadaFiltroPainel = computed(() => this.empresaSelecionadaFiltroPainel());

  // Computeds data inicial e final
  readonly _dataInicialFiltroPainel = computed(() => this.dataInicialFiltroPainel());
  readonly _dataFinalFiltroPainel = computed(() => this.dataFinalFiltroPainel());

  // Computed status
  readonly _statusPossiveisFiltroPainel = computed(() => this.statusPossiveisFiltroPainel());
  readonly _statusSelecionadoFiltroPainel = computed(() => this.statusSelecionadoFiltroPainel());

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

    this.dataInicialFiltroPainel.set(null);
    this.dataFinalFiltroPainel.set(null);
    this.empresaSelecionadaFiltroPainel.set(null);
    this.statusSelecionadoFiltroPainel.set(null);
  }

  public aoSelecionarEmpresa(event: Event): void {
    const elementoSelect = event.target as HTMLSelectElement;
    const empresaSelecionada = elementoSelect.value;

    if (empresaSelecionada == 'todos') {
      this.empresaSelecionadaFiltroPainel.set(null);
      this.marcacaoService.filtrarMarcacoesPorEmpresa(null);
      return;
    }

    this.empresaSelecionadaFiltroPainel.set(empresaSelecionada);
    this.marcacaoService.filtrarMarcacoesPorEmpresa(empresaSelecionada);
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
