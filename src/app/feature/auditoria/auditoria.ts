import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuditLog, AuditLogService } from '../../core/services/audit-log/audit-log.service';
import { DateHelper } from '../../core/helpers/dateHelper';

@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './auditoria.html',
  styleUrl: './auditoria.css'
})
export class Auditoria {
  private auditLogService = inject(AuditLogService);

  logs = signal<AuditLog[]>([]);
  isLoading = signal(false);

  // Filters
  dataInicio = signal(DateHelper.toIsoDate(DateHelper.getStringDate(new Date())));
  dataFim = signal(DateHelper.toIsoDate(DateHelper.getStringDate(new Date())));
  usuarioFiltro = signal('');
  acaoFiltro = signal('');

  constructor() {
    effect(() => {
      this.loadLogs();
    }, { allowSignalWrites: true });
  }

  async loadLogs() {
    this.isLoading.set(true);
    const filters = {
      dataInicio: this.dataInicio(),
      dataFim: this.dataFim(),
      usuario: this.usuarioFiltro(),
      acao: this.acaoFiltro()
    };
    const results = await this.auditLogService.getLogs(filters);
    this.logs.set(results);
    this.isLoading.set(false);
  }

  formatData(dateStr: string): string {
    if (!dateStr) return '';
    const [date, time] = dateStr.split(' ');
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y} ${time}`;
  }

  getBadgeClass(acao: string): string {
    switch (acao) {
      case 'CREATE': return 'badge-create';
      case 'UPDATE': return 'badge-update';
      case 'DELETE': return 'badge-delete';
      default: return '';
    }
  }

  formatJson(json: any): string {
    if (!json) return '-';
    return JSON.stringify(json, null, 2);
  }
}
