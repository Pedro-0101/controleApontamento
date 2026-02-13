import { Component, OnInit, signal, inject, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { DateHelper } from '../../core/helpers/dateHelper';

@Component({
  selector: 'app-eventos',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './eventos.html',
  styleUrl: './eventos.css'
})
export class EventosComponent implements OnInit {
  private marcacaoService = inject(MarcacaoService);
  private employeeService = inject(EmployeeService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);

  events = signal<any[]>([]);
  employees = signal<any[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);

  // Form state
  showForm = signal(false);
  editingId = signal<number | null>(null);

  formData = {
    matricula: '',
    dataInicio: '',
    dataFim: '',
    tipoEvento: ''
  };

  searchTerm = signal('');
  filteredEmployees = computed(() => {
    const term = this.searchTerm().toLowerCase();
    return this.employees().filter(emp =>
      emp.nome.toLowerCase().includes(term) ||
      emp.matricula.toLowerCase().includes(term)
    );
  });

  statusPeriodo = MarcacaoService.getPeriodEvents();

  async ngOnInit() {
    await Promise.all([
      this.loadEvents(),
      this.loadEmployees()
    ]);
  }

  async loadEvents() {
    this.isLoading.set(true);
    const results = await this.marcacaoService.getAllEvents();
    this.events.set(results);
    this.isLoading.set(false);
  }

  async loadEmployees() {
    try {
      const emps = await this.employeeService.getAllActiveEmployees();
      this.employees.set(emps);
    } catch (error) {
      console.error('Erro ao buscar funcionários:', error);
    }
  }

  openAddForm() {
    this.editingId.set(null);
    this.formData = {
      matricula: '',
      dataInicio: '',
      dataFim: '',
      tipoEvento: ''
    };
    this.showForm.set(true);
  }

  editEvent(event: any) {
    this.editingId.set(event.id);
    this.formData = {
      matricula: event.matricula_funcionario,
      dataInicio: event.data_inicio,
      dataFim: event.data_fim,
      tipoEvento: event.tipo_evento
    };
    this.showForm.set(true);
  }

  async saveEvent() {
    if (!this.formData.matricula || !this.formData.dataInicio || !this.formData.dataFim || !this.formData.tipoEvento) {
      this.toastService.warning('Preencha todos os campos.');
      return;
    }

    this.isSaving.set(true);
    try {
      if (this.editingId()) {
        await this.marcacaoService.updateEvent(
          this.editingId()!,
          this.formData.dataInicio,
          this.formData.dataFim,
          this.formData.tipoEvento
        );
        this.toastService.success('Evento atualizado!');
      } else {
        await this.marcacaoService.saveEvent(
          this.formData.matricula,
          this.formData.dataInicio,
          this.formData.dataFim,
          this.formData.tipoEvento,
          'PERIODO'
        );
        this.toastService.success('Evento lançado com sucesso!');
      }
      this.showForm.set(false);
      await this.loadEvents();
    } catch (error) {
      this.toastService.error('Erro ao salvar evento.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteEvent(id: number) {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;

    try {
      await this.marcacaoService.deleteEvent(id);
      this.toastService.success('Evento excluído.');
      await this.loadEvents();
    } catch (error) {
      this.toastService.error('Erro ao excluir evento.');
    }
  }

  formatData(dateStr: string) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }
}
