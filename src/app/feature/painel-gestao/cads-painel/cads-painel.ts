import { Component, EventEmitter, inject, Output, effect, Injector, runInInjectionContext } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
import { LoggerService } from '../../../core/services/logger/logger.service';

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
  private logger = inject(LoggerService);
  private injector = inject(Injector);

  @Output() cardClicked = new EventEmitter<CardFilter>();

  readonly _totalFuncionarios   = this.marcacaoService._totalFuncionarios;
  readonly _totalPresentes      = this.marcacaoService._totalPresentes;
  readonly _totalAtrasoEntrada  = this.marcacaoService._totalAtrasoEntrada;
  readonly _totalAfastamentos   = this.marcacaoService._totalAfastamentos;
  readonly _totalInconsistencias = this.marcacaoService._totalInconsistencias;

  readonly AFASTAMENTO_STATUSES = ['Ferias', 'Atestado', 'Afastado', 'Suspensao', 'Folga', 'Feriado'];
  readonly INCONSISTENCIA_STATUSES = ['Falta', 'Atraso', 'Incompleto', 'Pendente'];

  constructor() {
    this.logger.info('CadsPainel [constructor]', 'Componente inicializado');
    runInInjectionContext(this.injector, () => {
      effect(() => {
        const tf = this._totalFuncionarios();
        const tp = this._totalPresentes();
        const ta = this._totalAtrasoEntrada();
        const taf = this._totalAfastamentos();
        const ti = this._totalInconsistencias();
        this.logger.info('CadsPainel [effect]', `CARDS RECALCULADOS -> Funcionarios=${tf} Presentes=${tp} Atrasos=${ta} Afastamentos=${taf} Inconsistencias=${ti}`);
      });
    });
  }

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

  /** Returns an array of 10 booleans for the mini progress bar (true = filled) */
  getMiniBarItems(value: number, total: number): boolean[] {
    const filled = total > 0 ? Math.round((value / total) * 10) : 0;
    return Array.from({ length: 10 }, (_, i) => i < filled);
  }
}
