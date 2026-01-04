import { Component } from '@angular/core';
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

}
