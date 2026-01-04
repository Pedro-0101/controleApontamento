import { Component, computed, inject, signal } from '@angular/core';
import { LoggerService } from '../../../core/services/logger/logger.service';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
import { DateHelper } from '../../../core/helpers/dateHelper';
import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';
import { LinhaTabelaMarcacoes } from './linha-tabela-marcacoes/linha-tabela-marcacoes';

@Component({
  selector: 'app-tabela-funcionarios',
  imports: [LinhaTabelaMarcacoes],
  templateUrl: './tabela-funcionarios.html',
  styleUrl: './tabela-funcionarios.css',
})
export class TabelaFuncionarios {
  
  private loggerService = inject(LoggerService);
  private marcacaoService = inject(MarcacaoService);

  private isLoadingMarcacoesPainel = signal(true);
  private marcacoesDiaTabelaPainel = signal<MarcacaoDia[]>([]);

  readonly _isLoadingMarcacoesPainel = computed(() => this.isLoadingMarcacoesPainel());
  readonly _marcacoesDiaTabelaPainel = computed(() => this.marcacoesDiaTabelaPainel());

  constructor() {
    this.loggerService.info('TabelaFuncionariosComponent', 'Componente inicializado');
  }

  ngOnInit() {
    this.loadMarcacoes();
  }

  private async loadMarcacoes() {
    this.isLoadingMarcacoesPainel.set(true);

    try {
        const today = new Date();
        const dataInicio = DateHelper.getFirstDayOfMonth(today);
        const dataFim = DateHelper.getLastDayOfMonth(today);

        await this.marcacaoService.updateMarcacoes(dataInicio, dataFim);
        const marcacoesFormatadas = this.marcacaoService.getMarcacoesFormatadas()();
        this.marcacoesDiaTabelaPainel.set(marcacoesFormatadas);
        
    } catch (error) {
       this.loggerService.error('TabelaFuncionarios', 'Erro', error);
    } finally {
        this.isLoadingMarcacoesPainel.set(false);
    }
  }
}