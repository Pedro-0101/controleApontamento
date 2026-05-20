import { Component, EventEmitter, inject, Output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';

export interface CardFilter {
  statuses: string[];
  especiais: string[];
}

@Component({
  selector: 'app-cads-painel',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './cads-painel.html',
  styleUrl: './cads-painel.css',
})
export class CadsPainel {
  private marcacaoService = inject(MarcacaoService);

  @Output() cardClicked = new EventEmitter<CardFilter>();

  readonly _totalFuncionarios   = this.marcacaoService._totalFuncionarios;
  readonly _totalPresentes      = this.marcacaoService._totalPresentes;
  readonly _totalAtrasoEntrada  = this.marcacaoService._totalAtrasoEntrada;
  readonly _totalAfastamentos   = this.marcacaoService._totalAfastamentos;
  readonly _totalInconsistencias = this.marcacaoService._totalInconsistencias;

  readonly AFASTAMENTO_STATUSES = ['Ferias', 'Atestado', 'Afastado', 'Suspensao', 'Folga', 'Feriado'];
  readonly INCONSISTENCIA_STATUSES = ['Falta', 'Atraso', 'Incompleto', 'Pendente'];

  onPresencaClick(): void {
    this.cardClicked.emit({ statuses: [], especiais: ['com_marcacoes'] });
  }

  onAtrasoClick(): void {
    this.cardClicked.emit({ statuses: [], especiais: ['atraso_entrada'] });
  }

  onAfastamentoClick(): void {
    this.cardClicked.emit({ statuses: this.AFASTAMENTO_STATUSES, especiais: [] });
  }

  onInconsistenciasClick(): void {
    this.cardClicked.emit({ statuses: this.INCONSISTENCIA_STATUSES, especiais: [] });
  }
}
