import { Component, inject } from '@angular/core';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
import { CardFaltas } from './card-faltas/card-faltas';
import { CardIncompletos } from './card-incompletos/card-incompletos';
import { CardSolicitacoes } from './card-solicitacoes/card-solicitacoes';

@Component({
  selector: 'app-cads-painel',
  imports: [CardFaltas, CardIncompletos, CardSolicitacoes],
  templateUrl: './cads-painel.html',
  styleUrl: './cads-painel.css',
})
export class CadsPainel {
  private marcacaoService = inject(MarcacaoService);

  readonly _totalFaltas = this.marcacaoService._totalFaltas;
  readonly _totalPendentes = this.marcacaoService._totalPendentes;
  readonly _totalIncompletos = this.marcacaoService._totalIncompletos;
}
