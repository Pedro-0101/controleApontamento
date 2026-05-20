import { Component, inject, input, Output, EventEmitter } from '@angular/core';
import { MarcacaoService } from '../../../../core/services/marcacao/marcacao.service';
import { MarcacaoDia } from '../../../../models/marcacaoDia/marcacao-dia';
import { DateHelper } from '../../../../core/helpers/dateHelper';
import { TitleCaseCustomPipe } from '../../../../shared/pipes/title-case-custom.pipe';

@Component({
  selector: 'tr[app-linha-tabela-marcacoes]',
  standalone: true,
  imports: [TitleCaseCustomPipe],
  templateUrl: './linha-tabela-marcacoes.html',
  styleUrl: './linha-tabela-marcacoes.css',
})
export class LinhaTabelaMarcacoes {

  private marcacaoService = inject(MarcacaoService);

  marcacao = input.required<MarcacaoDia>();
  isSelected = input<boolean>(false);
  @Output() openDetails = new EventEmitter<MarcacaoDia>();
  @Output() toggleSelect = new EventEmitter<void>();



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

  getTempoAlmoco(): string {
    const ativas = this.marcacao().marcacoes.filter(m => !m.desconsiderado);
    if (ativas.length !== 4) return '--:--';

    const diffMs = ativas[2].dataMarcacao.getTime() - ativas[1].dataMarcacao.getTime();
    if (diffMs < 0) return '--:--';

    const totalMin = Math.floor(diffMs / (1000 * 60));
    const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
    const m = (totalMin % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  isAlmocoIrregular(): boolean {
    const ativas = this.marcacao().marcacoes.filter(m => !m.desconsiderado);
    if (ativas.length !== 4) return false;

    const diffMin = Math.floor((ativas[2].dataMarcacao.getTime() - ativas[1].dataMarcacao.getTime()) / 60000);
    return Math.abs(diffMin - 60) > 10;
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