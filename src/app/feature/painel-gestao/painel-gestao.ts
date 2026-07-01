import { Component, inject, signal, computed, ViewChild, ElementRef, effect } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { LoggerService } from '../../core/services/logger/logger.service';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';
import { TabelaFuncionarios } from './tabela-funcionarios/tabela-funcionarios';
import { FiltrosTabelaMarcacoes } from './tabela-funcionarios/filtros-tabela-marcacoes/filtros-tabela-marcacoes';
import { CadsPainel, CardFilter } from './cads-painel/cads-painel';
import { ModalAdicionarPontoGlobal } from './modal-adicionar-ponto-global/modal-adicionar-ponto-global';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { ButtonComponent } from '../../shared/button/button';
import { DateHelper } from '../../core/helpers/dateHelper';

@Component({
  selector: 'app-painel-gestao',
  standalone: true,
  imports: [FiltrosTabelaMarcacoes, TabelaFuncionarios, CadsPainel, ModalAdicionarPontoGlobal, LucideAngularModule, ButtonComponent],
  templateUrl: './painel-gestao.html',
  styleUrl: './painel-gestao.css',
  providers: [DatePipe]
})
export class PainelGestao {

  private loggerService = inject(LoggerService);
  private marcacaoService = inject(MarcacaoService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);

  protected isLoading = signal(true);
  protected marcacoesDia = signal<MarcacaoDia[]>([]);
  protected showModalPontoGlobal = signal(false);
  protected isRefreshing = signal(false);

  @ViewChild('dateInput') dateInput!: ElementRef<HTMLInputElement>;
  @ViewChild('filtros') filtros!: FiltrosTabelaMarcacoes;
  @ViewChild('tabela') tabela!: TabelaFuncionarios;

  // Navegação por dia
  protected currentDate = signal<Date>(new Date());

  protected dataFormatada = computed(() => {
    const date = this.currentDate();
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const diaSemana = dias[date.getDay()];
    const dateStr = DateHelper.getStringDate(date);
    return `${diaSemana}, ${dateStr}`;
  });

  protected isHoje = computed(() => {
    const current = this.currentDate();
    const today = new Date();
    return current.getFullYear() === today.getFullYear()
      && current.getMonth() === today.getMonth()
      && current.getDate() === today.getDate();
  });

  constructor() {
    this.loggerService.info('PainelGestaoComponent', 'Componente inicializado');

    // Sincroniza a data selecionada na query string (?data=YYYY-MM-DD)
    effect(() => {
      const d = this.currentDate();
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      this.loggerService.info('PainelGestaoComponent [effect]', `currentDate mudou -> ${iso}`);
      this.router.navigate([], {
        relativeTo: this.activatedRoute,
        queryParams: { data: iso },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  ngOnInit() {
    this.loggerService.info('PainelGestaoComponent [ngOnInit]', 'ngOnInit disparado');
    // Restaura a data da URL ao abrir a página
    const dataParam = this.activatedRoute.snapshot.queryParams['data'];
    if (dataParam) {
      const [year, month, day] = dataParam.split('-').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        this.loggerService.info('PainelGestaoComponent [ngOnInit]', `Restaurando data da URL: ${dataParam}`);
        this.currentDate.set(new Date(year, month - 1, day));
      }
    }
    this.loggerService.info('PainelGestaoComponent [ngOnInit]', `currentDate antes de carregarDia: ${this.currentDate().toISOString()}`);
    this.carregarDia();
  }

  async carregarDia() {
    const dateStr = DateHelper.getStringDate(this.currentDate());
    this.loggerService.info('PainelGestaoComponent [carregarDia]', `Iniciando carregamento para data: ${dateStr}`);
    this.loggerService.info('PainelGestaoComponent [carregarDia]', `marcacoesFiltradas ANTES: ${this.marcacaoService._marcacoesFiltradas().length} itens`);

    try {
      const result = await this.marcacaoService.updateMarcacoes(dateStr, dateStr);
      this.loggerService.info('PainelGestaoComponent [carregarDia]', `updateMarcacoes retornou ${result.length} marcações brutas`);
      this.loggerService.info('PainelGestaoComponent [carregarDia]', `marcacoesFiltradas DEPOIS: ${this.marcacaoService._marcacoesFiltradas().length} itens`);
      this.loggerService.info('PainelGestaoComponent [carregarDia]', `totalFuncionarios card: ${this.marcacaoService._totalFuncionarios()}`);
      this.loggerService.info('PainelGestaoComponent [carregarDia]', `totalPresentes card: ${this.marcacaoService._totalPresentes()}`);
      this.loggerService.info('PainelGestaoComponent [carregarDia]', `dataFormatada signal: ${this.dataFormatada()}`);
    } catch (e) {
      this.loggerService.error('PainelGestaoComponent [carregarDia]', `ERRO ao carregar dia`, e);
    }

    // Prefetch dos dias adjacentes em background
    const diaAnterior = new Date(this.currentDate());
    diaAnterior.setDate(diaAnterior.getDate() - 1);
    const diaAnteriorStr = DateHelper.getStringDate(diaAnterior);

    const diaProximo = new Date(this.currentDate());
    diaProximo.setDate(diaProximo.getDate() + 1);
    const diaProximoStr = DateHelper.getStringDate(diaProximo);

    // Prefetch ambos em paralelo
    Promise.all([
      this.marcacaoService.prefetchMarcacoes(diaAnteriorStr, diaAnteriorStr),
      this.marcacaoService.prefetchMarcacoes(diaProximoStr, diaProximoStr)
    ]);
  }

  irParaDiaAnterior() {
    this.loggerService.info('PainelGestaoComponent [irParaDiaAnterior]', `Data atual: ${this.currentDate().toISOString()}`);
    const novaData = new Date(this.currentDate());
    novaData.setDate(novaData.getDate() - 1);
    this.loggerService.info('PainelGestaoComponent [irParaDiaAnterior]', `Nova data: ${novaData.toISOString()}`);
    this.currentDate.set(novaData);
    this.loggerService.info('PainelGestaoComponent [irParaDiaAnterior]', `currentDate apos set: ${this.currentDate().toISOString()}`);
    this.tabela?.clearSelection();
    this.carregarDia();
  }

  irParaProximoDia() {
    if (this.isHoje()) {
      this.loggerService.info('PainelGestaoComponent [irParaProximoDia]', 'Bloqueado: já é hoje');
      return;
    }
    this.loggerService.info('PainelGestaoComponent [irParaProximoDia]', `Data atual: ${this.currentDate().toISOString()}`);
    const novaData = new Date(this.currentDate());
    novaData.setDate(novaData.getDate() + 1);
    this.loggerService.info('PainelGestaoComponent [irParaProximoDia]', `Nova data: ${novaData.toISOString()}`);
    this.currentDate.set(novaData);
    this.loggerService.info('PainelGestaoComponent [irParaProximoDia]', `currentDate apos set: ${this.currentDate().toISOString()}`);
    this.tabela?.clearSelection();
    this.carregarDia();
  }

  irParaHoje() {
    this.loggerService.info('PainelGestaoComponent [irParaHoje]', 'Indo para hoje');
    this.currentDate.set(new Date());
    this.tabela?.clearSelection();
    this.carregarDia();
  }

  irParaData(date: Date) {
    this.loggerService.info('PainelGestaoComponent [irParaData]', `Data selecionada: ${date.toISOString()}`);
    this.currentDate.set(date);
    this.tabela?.clearSelection();
    this.carregarDia();
  }

  async atualizarTabela() {
    this.isRefreshing.set(true);
    const dateStr = DateHelper.getStringDate(this.currentDate());
    // Limpar cache do dia atual para forçar busca fresca
    this.marcacaoService.clearPrefetchCache(`${dateStr}|${dateStr}`);
    await this.carregarDia();
    this.isRefreshing.set(false);
  }

  onCardClicked(filter: CardFilter): void {
    this.filtros.filtrarPorCard(filter.statuses, filter.especiais);
  }

  onDatePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.value) return;
    // input.value is YYYY-MM-DD
    const [year, month, day] = input.value.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, day);
    this.irParaData(selectedDate);
    // Reset input so same date can be re-selected
    input.value = '';
  }

}
