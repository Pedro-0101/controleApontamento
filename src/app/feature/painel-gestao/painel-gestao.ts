import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LoggerService } from '../../core/services/logger/logger.service';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';
import { TabelaFuncionarios } from './tabela-funcionarios/tabela-funcionarios';
import { FiltrosTabelaMarcacoes } from './tabela-funcionarios/filtros-tabela-marcacoes/filtros-tabela-marcacoes';

@Component({
  selector: 'app-painel-gestao',
  imports: [FiltrosTabelaMarcacoes, TabelaFuncionarios],
  templateUrl: './painel-gestao.html',
  styleUrl: './painel-gestao.css',
  providers: [DatePipe]
})
export class PainelGestao {

  private loggerService = inject(LoggerService);

  protected isLoading = signal(true);
  protected marcacoesDia = signal<MarcacaoDia[]>([]);

  constructor() {
    this.loggerService.info('PainelGestaoComponent', 'Componente inicializado');
  }

}
