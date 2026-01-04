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

  readonly _isLoadingMarcacoesPainel = this.marcacaoService._isLoadingMarcacoes;
  readonly _marcacoesDiaTabelaPainel = this.marcacaoService._marcacoesFiltradas;

  constructor() {
    this.loggerService.info('TabelaFuncionariosComponent', 'Componente inicializado');
  }

  ngOnInit() {
    this.loadMarcacoes();
  }

  loadMarcacoes() {
    this.loggerService.info('TabelaFuncionarios', 'Carregando marcações para a tabela periodo padrao hoje');

    try {

      const todayRange = DateHelper.getTodayRange();
      const dataInicio = todayRange.start;
      const dataFim = todayRange.end;

      this.marcacaoService.updateMarcacoes(dataInicio, dataFim);

    } catch (error) {
      this.loggerService.error('TabelaFuncionarios', 'Erro', error);
    }
  }
}