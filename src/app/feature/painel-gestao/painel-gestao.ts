import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LoggerService } from '../../core/services/logger/logger.service';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';
import { TabelaFuncionarios } from './tabela-funcionarios/tabela-funcionarios';
import { FiltrosTabelaMarcacoes } from './tabela-funcionarios/filtros-tabela-marcacoes/filtros-tabela-marcacoes';
import { CadsPainel } from "./cads-painel/cads-painel";
import { ModalAdicionarPontoGlobal } from './modal-adicionar-ponto-global/modal-adicionar-ponto-global';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';

@Component({
  selector: 'app-painel-gestao',
  standalone: true,
  imports: [FiltrosTabelaMarcacoes, TabelaFuncionarios, CadsPainel, ModalAdicionarPontoGlobal, LucideAngularModule],
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

  constructor() {
    this.loggerService.info('PainelGestaoComponent', 'Componente inicializado');
  }

}
