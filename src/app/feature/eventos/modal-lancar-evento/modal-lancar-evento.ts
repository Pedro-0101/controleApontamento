import { Component, EventEmitter, Output, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
import { ToastService } from '../../../core/services/toast/toast.service';

@Component({
  selector: 'app-modal-lancar-evento',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './modal-lancar-evento.html',
  styleUrl: './modal-lancar-evento.css'
})
export class ModalLancarEventoComponent {
  private marcacaoService = inject(MarcacaoService);
  private toastService = inject(ToastService);

  matricula = input.required<string>();
  nome = input.required<string>();
  data = input<string>('');

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  isSaving = signal(false);

  tipoEvento = signal('');
  dataInicio = signal('');
  dataFim = signal('');
  detalhes = signal('');

  statusPeriodo = MarcacaoService.getPeriodEvents();

  constructor() {
    const hoje = new Date();
    const dataStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const dataInicial = this.data() || dataStr;
    this.dataInicio.set(dataInicial);
    this.dataFim.set(dataInicial);
  }

  async salvar() {
    if (!this.tipoEvento() || !this.dataInicio() || !this.dataFim()) {
      this.toastService.warning('Preencha todos os campos obrigatórios.');
      return;
    }
    if (this.dataInicio() > this.dataFim()) {
      this.toastService.warning('A data de término deve ser igual ou maior que a data de início.');
      return;
    }

    this.isSaving.set(true);
    try {
      await this.marcacaoService.saveEvent(
        this.matricula(),
        this.dataInicio(),
        this.dataFim(),
        this.tipoEvento(),
        'PERIODO',
        this.detalhes()
      );
      this.toastService.success('Evento lançado com sucesso!');
      this.created.emit();
    } catch {
      this.toastService.error('Erro ao salvar evento.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
