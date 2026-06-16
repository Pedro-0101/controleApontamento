import { Component, effect, inject, signal, computed, untracked, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { FuncionarioRelogioService } from '../../../core/services/funcionario-relogio/funcionario-relogio.service';
import { RelogioVinculado } from '../../../models/relogio-vinculado/relogio-vinculado';
import { Pagination } from '../../../shared/pagination/pagination';
import { SearchFilter, FilterOption } from '../../../shared/search-filter/search-filter';
import { MultiSelectDropdown } from '../../../shared/multi-select-dropdown/multi-select-dropdown';
import { RangeSlider, RangeValue } from '../../../shared/range-slider/range-slider';
import { TitleCaseCustomPipe } from '../../../shared/pipes/title-case-custom.pipe';

export type FuncionarioSortColumn =
  | 'matricula'
  | 'nome'
  | 'empresa'
  | 'local'
  | 'cargo'
  | 'ativo'
  | 'relogiosCadastrado'
  | 'relogiosAtivo';

@Component({
  selector: 'app-relogios-funcionarios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, SearchFilter, MultiSelectDropdown, RangeSlider, TitleCaseCustomPipe],
  templateUrl: './relogios-funcionarios.html',
  styleUrl: './relogios-funcionarios.css'
})
export class RelogiosFuncionarios {
  private funcionarioRelogioService = inject(FuncionarioRelogioService);

  /** A partir desta quantidade de relógios o contador ganha destaque vermelho */
  readonly limiteRelogiosAlerta = 5;
  /** Teto do slider; no máximo significa "sem limite superior" (10+) */
  readonly relogiosAtivoSliderMax = 10;

  @ViewChild(MultiSelectDropdown) multiSelect!: MultiSelectDropdown;

  searchText = signal('');
  statusFilter = signal('all');
  selectedCompanies = signal<string[]>([]);
  relogiosAtivoMin = signal(0);
  relogiosAtivoMax = signal(10);
  currentPage = signal(1);
  itemsPerPage = signal(25);

  sortColumn = signal<FuncionarioSortColumn | ''>('');
  sortDirection = signal<'asc' | 'desc'>('asc');

  expandedMatricula = signal<string | null>(null);
  relogiosVinculados = signal<RelogioVinculado[]>([]);
  loadingVinculos = signal(false);

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
    return companies.map(c => ({ nome: c }));
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

    const min = this.relogiosAtivoMin();
    const max = this.relogiosAtivoMax();
    if (min > 0 || max < this.relogiosAtivoSliderMax) {
      // Contadores ainda não carregados (null) permanecem visíveis: o effect
      // carrega os contadores da página exibida e o filtro se refina sozinho.
      // No teto do slider o limite superior é aberto (10+).
      result = result.filter(f =>
        f.relogiosAtivo === null ||
        (f.relogiosAtivo >= min && (max === this.relogiosAtivoSliderMax || f.relogiosAtivo <= max))
      );
    }

    return result;
  });

  sortedFuncionarios = computed(() => {
    const column = this.sortColumn();
    const result = this.filteredFuncionarios();
    if (!column) return result;

    const dir = this.sortDirection() === 'asc' ? 1 : -1;
    return [...result].sort((a, b) => {
      const va = a[column];
      const vb = b[column];
      // Contadores ainda não carregados (null) sempre ao final
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
    });
  });

  paginatedFuncionarios = computed(() => {
    const sorted = this.sortedFuncionarios();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return sorted.slice(start, start + this.itemsPerPage());
  });

  constructor() {
    // Carrega os contadores de relógios apenas para a página visível;
    // o serviço ignora matrículas já contadas, evitando loop do effect.
    effect(() => {
      const visiveis = this.paginatedFuncionarios();
      if (visiveis.length === 0) return;
      untracked(() => this.funcionarioRelogioService.carregarContadores(visiveis));
    });
  }

  async toggleVinculos(matricula: string) {
    if (this.expandedMatricula() === matricula) {
      this.expandedMatricula.set(null);
      this.relogiosVinculados.set([]);
      return;
    }
    this.expandedMatricula.set(matricula);
    this.loadingVinculos.set(true);
    this.relogiosVinculados.set([]);
    try {
      const vinculos = await this.funcionarioRelogioService.getRelogiosVinculados(matricula);
      // Ignora resposta se o usuário já expandiu outra linha
      if (this.expandedMatricula() === matricula) {
        this.relogiosVinculados.set(vinculos);
      }
    } finally {
      if (this.expandedMatricula() === matricula) {
        this.loadingVinculos.set(false);
      }
    }
  }

  onSort(column: FuncionarioSortColumn) {
    if (this.sortColumn() === column) {
      this.sortDirection.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
  }

  onSearchChange(search: string) {
    this.searchText.set(search);
    this.currentPage.set(1);
  }

  onFilterChange(filter: string) {
    this.statusFilter.set(filter);
    this.currentPage.set(1);
    if (this.multiSelect) {
      this.multiSelect.clearSelection();
    } else {
      this.selectedCompanies.set([]);
    }
  }

  onCompanySelectionChange(selected: string[]) {
    this.selectedCompanies.set(selected);
    this.currentPage.set(1);
  }

  onRelogiosAtivoRangeChange(range: RangeValue) {
    this.relogiosAtivoMin.set(range.min);
    this.relogiosAtivoMax.set(range.max);
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

  getVinculoStatusClass(vinculo: RelogioVinculado): string {
    return vinculo.ativo ? 'status-ativo' : 'status-inativo';
  }

  getVinculoStatusLabel(vinculo: RelogioVinculado): string {
    return vinculo.ativo ? 'Ativo' : 'Inativo';
  }
}
