import { Component, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { FuncionarioRelogioService } from '../../../core/services/funcionario-relogio/funcionario-relogio.service';
import { Pagination } from '../../../shared/pagination/pagination';
import { SearchFilter, FilterOption } from '../../../shared/search-filter/search-filter';
import { MultiSelectDropdown } from '../../../shared/multi-select-dropdown/multi-select-dropdown';
import { TitleCaseCustomPipe } from '../../../shared/pipes/title-case-custom.pipe';

@Component({
  selector: 'app-relogios-funcionarios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, SearchFilter, MultiSelectDropdown, TitleCaseCustomPipe],
  templateUrl: './relogios-funcionarios.html',
  styleUrl: './relogios-funcionarios.css'
})
export class RelogiosFuncionarios {
  private funcionarioRelogioService = inject(FuncionarioRelogioService);

  @ViewChild(MultiSelectDropdown) multiSelect!: MultiSelectDropdown;

  searchText = signal('');
  statusFilter = signal('all');
  selectedCompanies = signal<string[]>([]);
  currentPage = signal(1);
  itemsPerPage = signal(25);

  readonly isLoading = this.funcionarioRelogioService.isLoading;

  filterOptions = signal<FilterOption[]>([
    { label: 'Todos', value: 'all' },
    { label: 'Ativos', value: '1' },
    { label: 'Inativos', value: '0' }
  ]);

  companyOptions = computed(() => {
    const companies = [...new Set(
      this.funcionarioRelogioService.funcionarios()
        .map(f => f.empresa)
        .filter(e => !!e)
    )].sort();
    return companies.map(c => ({ nome: c, matricula: c }));
  });

  filteredFuncionarios = computed(() => {
    let result = this.funcionarioRelogioService.funcionarios();

    const search = this.searchText().toLowerCase();
    if (search) {
      result = result.filter(f =>
        f.nome.toLowerCase().includes(search) ||
        f.matricula.toLowerCase().includes(search) ||
        f.empresa.toLowerCase().includes(search) ||
        f.local.toLowerCase().includes(search) ||
        f.cargo.toLowerCase().includes(search)
      );
    }

    const status = this.statusFilter();
    if (status !== 'all') {
      result = result.filter(f => f.ativo === parseInt(status));
    }

    const companies = this.selectedCompanies();
    if (companies.length > 0) {
      result = result.filter(f => companies.includes(f.empresa));
    }

    return result;
  });

  paginatedFuncionarios = computed(() => {
    const filtered = this.filteredFuncionarios();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return filtered.slice(start, start + this.itemsPerPage());
  });

  onSearchChange(search: string) {
    this.searchText.set(search);
    this.currentPage.set(1);
  }

  onFilterChange(filter: string) {
    this.statusFilter.set(filter);
    this.currentPage.set(1);
    this.selectedCompanies.set([]);
    this.multiSelect?.clearSelection();
  }

  onCompanySelectionChange(selected: string[]) {
    this.selectedCompanies.set(selected);
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
  }

  getStatusClass(ativo: number): string {
    return ativo === 1 ? 'status-ativo' : 'status-inativo';
  }

  getStatusLabel(ativo: number): string {
    return ativo === 1 ? 'Ativo' : 'Inativo';
  }
}
