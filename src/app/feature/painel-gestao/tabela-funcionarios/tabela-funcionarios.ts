import { Component, inject, signal } from '@angular/core';
import { LoggerService } from '../../../core/services/logger/logger.service';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
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

  protected isLoading = signal(true);
  protected marcacoesDia = signal<MarcacaoDia[]>([]);

  constructor() {
    this.loggerService.info('TabelaFuncionariosComponent', 'Componente inicializado');
  }

  ngOnInit() {
    this.loadMarcacoes();
  }

  private async loadMarcacoes() {
    this.isLoading.set(true);

    try {
        const today = new Date();
        const dataInicio = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const dataFim = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

        await this.marcacaoService.updateMarcacoes(dataInicio, dataFim);
        const marcacoesFormatadas = this.marcacaoService.getMarcacoesFormatadas()();
        this.marcacoesDia.set(marcacoesFormatadas);
        
    } catch (error) {
       this.loggerService.error('TabelaFuncionarios', 'Erro', error);
    } finally {
        this.isLoading.set(false);
    }
  }
}