import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LoggerService } from '../../core/services/logger/logger.service';
import { Marcacao } from '../../models/marcacao/marcacao';

@Component({
  selector: 'app-painel-gestao',
  imports: [DatePipe],
  templateUrl: './painel-gestao.html',
  styleUrl: './painel-gestao.css',
  providers: [DatePipe]
})
export class PainelGestao {

  private loggerService = inject(LoggerService);

  protected isLoading = signal(true);
  protected marcacoesDia = signal<Marcacao[]>([]);

  constructor() {
    this.loggerService.info('PainelGestaoComponent', 'Componente inicializado');
  }

  ngOnInit() {
    // Simulação de carregamento de dados
    setTimeout(() => {
      this.isLoading.set(false);
      this.loggerService.info('PainelGestaoComponent', 'Dados carregados');
    }, 2000);
  }

}
