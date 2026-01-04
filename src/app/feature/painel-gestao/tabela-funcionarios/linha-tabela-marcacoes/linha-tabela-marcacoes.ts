import { Component, input } from '@angular/core';
import { MarcacaoDia } from '../../../../models/marcacaoDia/marcacao-dia';

@Component({
  selector: 'app-linha-tabela-marcacoes',
  imports: [],
  templateUrl: './linha-tabela-marcacoes.html',
  styleUrl: './linha-tabela-marcacoes.css',
})
export class LinhaTabelaMarcacoes {
  
  marcacao = input.required<MarcacaoDia>();

}