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

  // Search and Pagination state
  searchTerm = signal('');
  filterEventType = signal('');
  filterEmpresa = signal('');
  filterDataInicio = signal(''); 
  filterDataFim = signal('');
  
  // Sorting state
  sortColumn = signal<string>('data_inicio');
  sortDirection = signal<'asc' | 'desc'>('desc');
  
  currentPage = signal(1);
  itemsPerPage = signal(10);

  // Computeds for filtering and sorting
  enrichedEvents = computed(() => {
    const emps = this.allEmployeesList();
    return this.events().map(ev => {
      const emp = emps.find(e => e.matricula === String(ev.matricula_funcionario));
      return {
        ...ev,
        empresa: emp ? emp.empresa : ''
      };
    });
  });

  filteredEventsList = computed(() => {
    let result = this.enrichedEvents();
    const term = this.searchTerm().toLowerCase().trim();
    const type = this.filterEventType();
    const empFil = this.filterEmpresa().toLowerCase().trim();
    const dataIni = this.filterDataInicio();
    const dataFim = this.filterDataFim();

    if (term) {
      result = result.filter(e => 
        (e.nome_funcionario || '').toLowerCase().includes(term) ||
        String(e.matricula_funcionario || '').includes(term)
      );
    }
    
    if (type) {
      result = result.filter(e => e.tipo_evento === type);
    }

    if (empFil) {
      result = result.filter(e => (e.empresa || '').toLowerCase().includes(empFil));
    }

    if (dataIni || dataFim) {
      result = result.filter(e => {
        const evIni = e.data_inicio;
        const evFim = e.data_fim;
        if (dataIni && dataFim) {
          return evIni <= dataFim && evFim >= dataIni;
        } else if (dataIni) {
          return evFim >= dataIni;
        } else {
          return evIni <= dataFim;
        }
      });
    }
    
    return result;
  });

  sortedEventsList = computed(() => {
    const data = [...this.filteredEventsList()];
    const column = this.sortColumn();
    const direction = this.sortDirection();

    if (!column) return data;

    return data.sort((a, b) => {
      let valA = a[column];
      let valB = b[column];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  });

  totalPages = computed(() => {
    const total = this.sortedEventsList().length;
    return Math.max(1, Math.ceil(total / this.itemsPerPage()));
  });

  paginatedEvents = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    const end = start + this.itemsPerPage();
    return this.sortedEventsList().slice(start, end);
  });

  pagesArray = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | string)[] = [];
    
    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        pages.push(1, 2, 3, 4, '...', total);
      } else if (current >= total - 2) {
        pages.push(1, '...', total - 3, total - 2, total - 1, total);
      } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
      }
    }
    return pages;
  });

  onFilterChange() {
    this.currentPage.set(1);
  }

  goToPage(page: number | string) {
    if (typeof page === 'number') {
      this.currentPage.set(page);
    }
  }

  onSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  previousPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

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
