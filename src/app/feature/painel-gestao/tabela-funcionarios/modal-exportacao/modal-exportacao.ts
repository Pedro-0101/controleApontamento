import { Component, EventEmitter, Output, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoDia } from '../../../../models/marcacaoDia/marcacao-dia';
import { ExportFormat, ExportService } from '../../../../core/services/export/export.service';

@Component({
  selector: 'app-modal-exportacao',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './modal-exportacao.html',
  styleUrl: './modal-exportacao.css'
})
export class ModalExportacaoComponent {
  private exportService = inject(ExportService);

  data = input.required<MarcacaoDia[]>();
  @Output() close = new EventEmitter<void>();

  fields = [
    { key: 'id', label: 'ID', selected: true },
    { key: 'matricula', label: 'Matrícula', selected: true },
    { key: 'nome', label: 'Nome', selected: true },
    { key: 'data', label: 'Data', selected: true },
    { key: 'diaSemana', label: 'Dia Semana', selected: true },
    { key: 'marcacoes', label: 'Marcações', selected: true },
    { key: 'totalHoras', label: 'Total Horas', selected: true },
    { key: 'status', label: 'Status', selected: true },
    { key: 'comentario', label: 'Comentário', selected: true }
  ];

  selectedFormat: ExportFormat = 'excel';
  fileName: string = 'Relatorio_Marcacoes';

  confirmExport() {
    const selectedFields = this.fields.filter(f => f.selected).map(f => f.key);

    if (selectedFields.length === 0) {
      alert('Selecione ao menos um campo para exportar.');
      return;
    }

    this.exportService.export(this.data(), {
      fields: selectedFields,
      format: this.selectedFormat,
      fileName: this.fileName || 'Relatorio_Marcacoes'
    });

    this.close.emit();
  }

  confirmPrint() {
    const selectedFields = this.fields.filter(f => f.selected).map(f => f.key);

    if (selectedFields.length === 0) {
      alert('Selecione ao menos um campo para imprimir.');
      return;
    }

    this.exportService.export(this.data(), {
      fields: selectedFields,
      format: 'print',
      fileName: ''
    });

    this.close.emit();
  }

  cancel() {
    this.close.emit();
  }
}
