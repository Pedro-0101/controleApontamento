import { Component, inject, OnInit, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { Employee } from '../../models/employee/employee';
import { ModalColaborador } from './modal-colaborador/modal-colaborador';
import { Pagination } from '../../shared/pagination/pagination';
import { SearchFilter, FilterOption } from '../../shared/search-filter/search-filter';
import { MultiSelectDropdown } from '../../shared/multi-select-dropdown/multi-select-dropdown';
import { QRCodeService } from '../../core/services/qrcode/qrcode.service';

@Component({
  selector: 'app-colaboradores',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ModalColaborador, Pagination, SearchFilter, MultiSelectDropdown],
  templateUrl: './colaboradores.html',
  styleUrl: './colaboradores.css'
})
export class Colaboradores implements OnInit {
  private employeeService = inject(EmployeeService);
  private qrcodeService = inject(QRCodeService);

  @ViewChild(MultiSelectDropdown) multiSelect!: MultiSelectDropdown;

  allEmployees = signal<Employee[]>([]);
  searchText = signal('');
  statusFilter = signal('all');
  currentPage = signal(1);
  itemsPerPage = signal(25);
  isLoading = signal(false);
  showModal = signal(false);
  modalMode = signal<'create' | 'edit'>('create');
  selectedEmployee = signal<Employee | null>(null);
  selectedEmployeeIds = signal<number[]>([]);
  selectedCompanies = signal<string[]>([]);

  distinctCompanies = computed(() => {
    const emps = this.allEmployees();
    return [...new Set(emps.map(e => e.empresa).filter(c => !!c))].sort();
  });

  companyOptions = computed(() => {
    return this.distinctCompanies().map(c => ({
      id: 0,
      nome: c,
      matricula: c,
      empresa: c,
      qrcod: '',
      ativo: 1
    } as Employee));
  });

  isAllSelected = computed(() => {
    const paginated = this.paginatedEmployees();
    return paginated.length > 0 && paginated.every(emp => this.selectedEmployeeIds().includes(emp.id));
  });

  filterOptions = signal<FilterOption[]>([
    { label: 'Todos', value: 'all' },
    { label: 'Ativos', value: '1' },
    { label: 'Inativos', value: '0' }
  ]);

  // Filtered employees based on search and filter
  filteredEmployees = computed(() => {
    let result = this.allEmployees();

    // Apply search filter
    const search = this.searchText().toLowerCase();
    if (search) {
      result = result.filter(emp =>
        emp.nome.toLowerCase().includes(search) ||
        emp.matricula.toLowerCase().includes(search) ||
        emp.empresa.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    const status = this.statusFilter();
    if (status !== 'all') {
      result = result.filter(emp => emp.ativo === parseInt(status));
    }

    // Apply company filter (multi-select)
    const companies = this.selectedCompanies();
    if (companies.length > 0) {
      result = result.filter(emp => companies.includes(emp.empresa));
    }

    return result;
  });

  // Paginated employees
  paginatedEmployees = computed(() => {
    const filtered = this.filteredEmployees();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    const end = start + this.itemsPerPage();
    return filtered.slice(start, end);
  });

  async ngOnInit() {
    await this.loadEmployees();
  }

  async loadEmployees() {
    this.isLoading.set(true);
    try {
      const employees = await this.employeeService.getAllEmployees();
      this.allEmployees.set(employees);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearchChange(search: string) {
    this.searchText.set(search);
    this.currentPage.set(1); // Reset to first page on search
  }

  onFilterChange(filter: string) {
    this.statusFilter.set(filter);
    this.currentPage.set(1); // Reset to first page on filter
    this.selectedEmployeeIds.set([]); // Limpar seleção ao filtrar
    this.multiSelect?.clearSelection(); // Limpar filtro de empresa
  }

  onCompanySelectionChange(selected: string[]) {
    this.selectedCompanies.set(selected);
    this.currentPage.set(1);
    this.selectedEmployeeIds.set([]);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
    this.selectedEmployeeIds.set([]);
  }

  toggleAll() {
    const paginated = this.paginatedEmployees();
    const allSelected = this.isAllSelected();

    if (allSelected) {
      const paginatedIds = paginated.map(e => e.id);
      this.selectedEmployeeIds.update(current =>
        current.filter(id => !paginatedIds.includes(id))
      );
    } else {
      const newIds = paginated.map(e => e.id);
      this.selectedEmployeeIds.update(current =>
        [...new Set([...current, ...newIds])]
      );
    }
  }

  toggleEmployee(id: number) {
    this.selectedEmployeeIds.update(current => {
      if (current.includes(id)) {
        return current.filter(i => i !== id);
      }
      return [...current, id];
    });
  }

  async batchDeactivate() {
    const ids = this.selectedEmployeeIds();
    if (ids.length === 0) return;

    if (!confirm(`Deseja realmente desativar os ${ids.length} colaboradores selecionados?`)) {
      return;
    }

    this.isLoading.set(true);
    try {
      await this.employeeService.deactivateEmployeesBatch(ids);
      this.selectedEmployeeIds.set([]);
      await this.loadEmployees();
      alert('Colaboradores desativados com sucesso!');
    } catch (error) {
      console.error('Erro ao desativar colaboradores:', error);
      alert('Erro ao realizar a operação de desativação.');
    } finally {
      this.isLoading.set(false);
    }
  }

  openCreateModal() {
    this.modalMode.set('create');
    this.selectedEmployee.set(null);
    this.showModal.set(true);
  }

  openEditModal(employee: Employee) {
    this.modalMode.set('edit');
    this.selectedEmployee.set(employee);
    this.showModal.set(true);
  }

  async deleteEmployee(employee: Employee) {
    if (!confirm(`Deseja realmente excluir ${employee.nome}?`)) return;

    try {
      await this.employeeService.deleteEmployee(employee.id);
      await this.loadEmployees();
      alert('Colaborador excluído com sucesso!');
    } catch (error) {
      alert('Erro ao excluir colaborador.');
      console.error(error);
    }
  }

  async generateCard(employee: Employee) {
    try {
      await this.qrcodeService.generateCardPDF(employee);
    } catch (error) {
      console.error('Erro ao gerar cartão:', error);
      alert('Erro ao gerar cartão do colaborador.');
    }
  }

  closeModal() {
    this.showModal.set(false);
    this.selectedEmployee.set(null);
  }

  async handleSave() {
    await this.loadEmployees();
    this.closeModal();
  }

  getStatusClass(ativo: number): string {
    return ativo === 1 ? 'status-ativo' : 'status-inativo';
  }

  getStatusLabel(ativo: number): string {
    return ativo === 1 ? 'Ativo' : 'Inativo';
  }
}
