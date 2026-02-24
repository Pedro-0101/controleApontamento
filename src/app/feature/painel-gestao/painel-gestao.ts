import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LoggerService } from '../../core/services/logger/logger.service';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';
import { TabelaFuncionarios } from './tabela-funcionarios/tabela-funcionarios';
import { FiltrosTabelaMarcacoes } from './tabela-funcionarios/filtros-tabela-marcacoes/filtros-tabela-marcacoes';
import { CadsPainel } from "./cads-painel/cads-painel";
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

  protected isLoading = signal(true);
  protected marcacoesDia = signal<MarcacaoDia[]>([]);
  protected showModalPontoGlobal = signal(false);
  protected isRefreshing = signal(false);

  @ViewChild('dateInput') dateInput!: ElementRef<HTMLInputElement>;

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
  }

  ngOnInit() {
    this.carregarDia();
  }

  async carregarDia() {
    const dateStr = DateHelper.getStringDate(this.currentDate());
    await this.marcacaoService.updateMarcacoes(dateStr, dateStr);

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
    const novaData = new Date(this.currentDate());
    novaData.setDate(novaData.getDate() - 1);
    this.currentDate.set(novaData);
    this.carregarDia();
  }

  irParaProximoDia() {
    if (this.isHoje()) return;
    const novaData = new Date(this.currentDate());
    novaData.setDate(novaData.getDate() + 1);
    this.currentDate.set(novaData);
    this.carregarDia();
  }

  irParaHoje() {
    this.currentDate.set(new Date());
    this.carregarDia();
  }

  irParaData(date: Date) {
    this.currentDate.set(date);
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
