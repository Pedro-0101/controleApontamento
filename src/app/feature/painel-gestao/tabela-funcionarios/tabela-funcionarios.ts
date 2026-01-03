import { Component, inject, signal } from '@angular/core';
import { LoggerService } from '../../../core/services/logger/logger.service';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';

@Component({
  selector: 'app-tabela-funcionarios',
  imports: [],
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
    this.loggerService.info('PainelGestaoComponent', 'Carregando marcações para a tabela');

    try {
      const today = new Date();
      const dataInicio = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const dataFim = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

      const dataInicioFormatada = dataInicio;
      const dataFimFormatada = dataFim;

      this.loggerService.info('PainelGestaoComponent', `Período de busca: ${dataInicioFormatada} a ${dataFimFormatada}`);

      await this.marcacaoService.updateMarcacoes(dataInicio, dataFim);
      const marcacoesFormatadas = this.marcacaoService.getMarcacoesFormatadas()();
      this.marcacoesDia.set(marcacoesFormatadas);

      this.loggerService.info('PainelGestaoComponent', `Marcações carregadas: ${marcacoesFormatadas.length} funcionarios diferentes encontrados`);
    } catch (error) {
      this.loggerService.error('PainelGestaoComponent', 'Erro ao carregar marcações', error);
    } finally {
      this.isLoading.set(false);
    }
  }
}
