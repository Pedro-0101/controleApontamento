import { Component, OnInit, signal, inject, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { DateHelper } from '../../core/helpers/dateHelper';
import { Employee } from '../../models/employee/employee';

import { MultiSelectDropdown } from '../../shared/multi-select-dropdown/multi-select-dropdown';

@Component({
  selector: 'app-eventos',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, MultiSelectDropdown],
  templateUrl: './eventos.html',
  styleUrl: './eventos.css'
})
export class EventosComponent implements OnInit {
  private marcacaoService = inject(MarcacaoService);
  private employeeService = inject(EmployeeService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);

  events = signal<any[]>([]);
  allEmployeesList = signal<Employee[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);

  // Company filter
  selectedCompanies = signal<string[]>([]);
  companies = signal<string[]>([]);

  companyOptions = computed(() =>
    this.companies().map(c => ({
      id: 0,
      nome: c,
      matricula: c,
      empresa: c,
      qrcod: '',
      ativo: 1
    } as Employee))
  );

  // Filter employees for the form based on selected companies
  filteredEmployees = computed(() => {
    const selected = this.selectedCompanies();
    if (selected.length === 0) return this.allEmployeesList();
    return this.allEmployeesList().filter(e => selected.includes(e.empresa));
  });

  // Form state
  showForm = signal(false);
  editingId = signal<number | null>(null);

  formData = {
    matriculas: [] as string[],
    dataInicio: '',
    dataFim: '',
    tipoEvento: ''
  };

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
      this.allEmployeesList.set(emps);

      const distinctCompanies = [...new Set(emps.map((e: Employee) => e.empresa).filter((c: string) => !!c))].sort() as string[];
      this.companies.set(distinctCompanies);
    } catch (error) {
      console.error('Erro ao buscar funcionários:', error);
    }
  }

  onCompanySelectionChange(selected: string[]) {
    this.selectedCompanies.set(selected);
    
    // Remove employees from form selection if they don't match the new company filter
    const validMatriculas = this.filteredEmployees().map(e => e.matricula);
    this.formData.matriculas = this.formData.matriculas.filter(m => validMatriculas.includes(m));
  }

  openAddForm() {
    this.editingId.set(null);
    this.selectedCompanies.set([]);
    this.formData = {
      matriculas: [],
      dataInicio: '',
      dataFim: '',
      tipoEvento: ''
    };
    this.showForm.set(true);
  }

  editEvent(event: any) {
    this.editingId.set(event.id);
    this.selectedCompanies.set([]);
    this.formData = {
      matriculas: [event.matricula_funcionario],
      dataInicio: event.data_inicio,
      dataFim: event.data_fim,
      tipoEvento: event.tipo_evento
    };
    this.showForm.set(true);
  }

  async saveEvent() {
    if (this.formData.matriculas.length === 0 || !this.formData.dataInicio || !this.formData.dataFim || !this.formData.tipoEvento) {
      this.toastService.warning('Preencha todos os campos.');
      return;
    }

    if (this.formData.dataInicio > this.formData.dataFim) {
      this.toastService.warning('A data de término deve ser igual ou maior que a data de início.');
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
        // Lançamento em massa
        const promises = this.formData.matriculas.map(matricula =>
          this.marcacaoService.saveEvent(
            matricula,
            this.formData.dataInicio,
            this.formData.dataFim,
            this.formData.tipoEvento,
            'PERIODO'
          )
        );
        await Promise.all(promises);
        this.toastService.success(`${this.formData.matriculas.length} eventos lançados com sucesso!`);
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
