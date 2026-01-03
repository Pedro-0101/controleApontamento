import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LoggerService } from '../../core/services/logger/logger.service';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';
import { TabelaFuncionarios } from './tabela-funcionarios/tabela-funcionarios';

@Component({
  selector: 'app-painel-gestao',
  imports: [TabelaFuncionarios],
  templateUrl: './painel-gestao.html',
  styleUrl: './painel-gestao.css',
  providers: [DatePipe]
})
export class PainelGestao {

  private loggerService = inject(LoggerService);
  private marcacaoService = inject(MarcacaoService);

  protected isLoading = signal(true);
  protected marcacoesDia = signal<MarcacaoDia[]>([]);

  constructor() {
    this.loggerService.info('PainelGestaoComponent', 'Componente inicializado');
  }

}
