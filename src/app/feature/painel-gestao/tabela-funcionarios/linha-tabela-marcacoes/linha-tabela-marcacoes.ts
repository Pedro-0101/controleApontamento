import { Component, computed, inject, input, Output, EventEmitter } from '@angular/core';
import { MarcacaoService } from '../../../../core/services/marcacao/marcacao.service';
import { MarcacaoDia } from '../../../../models/marcacaoDia/marcacao-dia';
import { DateHelper } from '../../../../core/helpers/dateHelper';

@Component({
  selector: 'tr[app-linha-tabela-marcacoes]',
  templateUrl: './linha-tabela-marcacoes.html',
  styleUrl: './linha-tabela-marcacoes.css',
})
export class LinhaTabelaMarcacoes {

  private marcacaoService = inject(MarcacaoService);

  marcacao = input.required<MarcacaoDia>();
  @Output() openDetails = new EventEmitter<MarcacaoDia>();



  abrirDetalhes() {
    this.openDetails.emit(this.marcacao());
  }

  formatHora(dataMarcacao: Date | string | undefined): string {
    if (!dataMarcacao) return '--:--';



    const date = dataMarcacao instanceof Date ? dataMarcacao : new Date(dataMarcacao);

    if (isNaN(date.getTime())) return '--:--';

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  saveComment(event: Event) {
    const input = event.target as any;
    const novoComentario = input.value;
    const m = this.marcacao();

    // Data no formato DD/MM/YYYY, converter para YYYY-MM-DD
    const dataIso = DateHelper.toIsoDate(m.data);

    this.marcacaoService.saveComment(m.matricula, dataIso, novoComentario)
      .then(() => {
        // Sucesso visual ou notificação opcional
      })
      .catch(err => {
        console.error('Erro ao salvar comentário', err);
        // Opcional: Reverter valor no input
      });
  }
}