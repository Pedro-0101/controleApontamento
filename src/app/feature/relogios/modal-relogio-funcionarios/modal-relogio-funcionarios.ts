import { Component, EventEmitter, inject, input, OnInit, Output, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../../core/services/relogio/relogio.service';
import { EmployeeService } from '../../../core/services/employee/employee.service';
import { Employee } from '../../../models/employee/employee';
import { Pagination } from '../../../shared/pagination/pagination';
import { MultiSelectDropdown } from '../../../shared/multi-select-dropdown/multi-select-dropdown';
import { TitleCaseCustomPipe } from '../../../shared/pipes/title-case-custom.pipe';

export interface FuncionarioRelogio {
  matricula: string;
  nome: string;
  empresa: string;
  local: string;
  cargo: string;
}

type SortColumn = 'matricula' | 'nome' | 'empresa' | 'local' | 'cargo';

@Component({
  selector: 'app-modal-relogio-funcionarios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, MultiSelectDropdown, TitleCaseCustomPipe],
  templateUrl: './modal-relogio-funcionarios.html',
  styleUrl: './modal-relogio-funcionarios.css'
})
export class ModalRelogioFuncionarios implements OnInit {
  private relogioService = inject(RelogioService);
  private employeeService = inject(EmployeeService);

  numSerie = input.required<string>();
  descricao = input.required<string>();

  @Output() close = new EventEmitter<void>();

  allFuncionarios = signal<FuncionarioRelogio[]>([]);
  isLoading = signal(true);
  searchText = signal('');
  currentPage = signal(1);
  itemsPerPage = signal(10);
  sortColumn = signal<SortColumn | null>(null);
  sortDirection = signal<'asc' | 'desc'>('asc');

  feedbackMessage = signal('');
  feedbackType = signal<'success' | 'error'>('success');
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  showGerenciar = signal(false);
  allEmployees = signal<Employee[]>([]);
  isLoadingGerenciar = signal(true);
  vinculadosSet = signal<Set<string>>(new Set());
  gerenciarSearchText = signal('');
  somenteAtivos = signal(true);
  selectedEmpresas = signal<string[]>([]);
  selectedLocais = signal<string[]>([]);
  gerenciarCurrentPage = signal(1);
  gerenciarItemsPerPage = signal(15);
  gerenciarSortColumn = signal<SortColumn | null>(null);
  gerenciarSortDirection = signal<'asc' | 'desc'>('asc');
  isSaving = signal(false);

  isSincronizandoApi = signal(false);

  showPreviewSincronizacao = signal(false);
  isLoadingPreview = signal(false);
  previewAVincular = signal<{ matricula: string; nome: string }[]>([]);
  previewADesvincular = signal<{ matricula: string; nome: string }[]>([]);
  previewSearchVincular = signal('');
  previewSearchDesvincular = signal('');

  previewAVincularFiltrado = computed(() => {
    const search = this.previewSearchVincular().toLowerCase().trim();
    if (!search) return this.previewAVincular();
    return this.previewAVincular().filter(f =>
      f.matricula.toLowerCase().includes(search) || f.nome.toLowerCase().includes(search)
    );
  });

  previewADesvincularFiltrado = computed(() => {
    const search = this.previewSearchDesvincular().toLowerCase().trim();
    if (!search) return this.previewADesvincular();
    return this.previewADesvincular().filter(f =>
      f.matricula.toLowerCase().includes(search) || f.nome.toLowerCase().includes(search)
    );
  });

  @ViewChild('empresaDropdown') empresaDropdown!: MultiSelectDropdown;
  @ViewChild('localDropdown') localDropdown!: MultiSelectDropdown;

  private showFeedback(message: string, type: 'success' | 'error') {
    this.feedbackMessage.set(message);
    this.feedbackType.set(type);
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => this.feedbackMessage.set(''), 5000);
  }

  filteredFuncionarios = computed(() => {
    let result = this.allFuncionarios();
    const search = this.searchText().toLowerCase().trim();
    if (search) {
      result = result.filter(f =>
        f.matricula.toLowerCase().includes(search) ||
        f.nome.toLowerCase().includes(search) ||
        (f.empresa || '').toLowerCase().includes(search) ||
        (f.local || '').toLowerCase().includes(search) ||
        (f.cargo || '').toLowerCase().includes(search)
      );
    }

    const col = this.sortColumn();
    if (col) {
      const dir = this.sortDirection() === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        const va = (a[col] || '').toLowerCase();
        const vb = (b[col] || '').toLowerCase();
        return va.localeCompare(vb, 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
      });
    }

    return result;
  });

  paginatedFuncionarios = computed(() => {
    const filtered = this.filteredFuncionarios();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return filtered.slice(start, start + this.itemsPerPage());
  });

  filteredEmployees = computed(() => {
    let result = this.allEmployees();
    const search = this.gerenciarSearchText().toLowerCase().trim();
    if (search) {
      result = result.filter(e =>
        e.matricula.toLowerCase().includes(search) ||
        e.nome.toLowerCase().includes(search) ||
        (e.empresa || '').toLowerCase().includes(search) ||
        (e.local || '').toLowerCase().includes(search) ||
        (e.cargo || '').toLowerCase().includes(search)
      );
    }

    if (this.somenteAtivos()) {
      result = result.filter(e => e.ativo === 1);
    }

    const empresas = this.selectedEmpresas();
    if (empresas.length > 0) {
      result = result.filter(e => empresas.includes(e.empresa));
    }

    const locais = this.selectedLocais();
    if (locais.length > 0) {
      result = result.filter(e => locais.includes(e.local));
    }

    const col = this.gerenciarSortColumn();
    if (col) {
      const dir = this.gerenciarSortDirection() === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        let va: string = '';
        let vb: string = '';
        if (col === 'matricula') { va = a.matricula; vb = b.matricula; }
        else if (col === 'nome') { va = a.nome; vb = b.nome; }
        else if (col === 'empresa') { va = a.empresa; vb = b.empresa; }
        else if (col === 'local') { va = a.local; vb = b.local; }
        else if (col === 'cargo') { va = a.cargo; vb = b.cargo; }
        return (va || '').localeCompare(vb || '', 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
      });
    }

    return result;
  });

  paginatedEmployees = computed(() => {
    const filtered = this.filteredEmployees();
    const start = (this.gerenciarCurrentPage() - 1) * this.gerenciarItemsPerPage();
    return filtered.slice(start, start + this.gerenciarItemsPerPage());
  });

  vinculadosCount = computed(() => this.vinculadosSet().size);

  empresaOptions = computed(() => {
    const empresas = [...new Set(
      this.allEmployees().map(e => e.empresa).filter(e => !!e)
    )].sort();
    return empresas.map(e => ({ nome: e }));
  });

  localOptions = computed(() => {
    const locais = [...new Set(
      this.allEmployees().map(e => e.local).filter(l => !!l)
    )].sort();
    return locais.map(l => ({ nome: l }));
  });

  allSelectedInPage = computed(() => {
    const page = this.paginatedEmployees();
    if (page.length === 0) return false;
    const vinc = this.vinculadosSet();
    return page.every(e => vinc.has(e.matricula));
  });

  async ngOnInit() {
    this.isLoading.set(true);
    try {
      const data = await this.relogioService.getFuncionariosByRelogio(this.numSerie());
      this.allFuncionarios.set(data);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearchChange(value: string) {
    this.searchText.set(value);
    this.currentPage.set(1);
  }

  onSort(col: SortColumn) {
    if (this.sortColumn() === col) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(col);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
  }

  async openGerenciar() {
    this.showGerenciar.set(true);
    this.isLoadingGerenciar.set(true);
    try {
      const [employees, vinculados] = await Promise.all([
        this.employeeService.getAllEmployees(),
        this.relogioService.getFuncionariosByRelogio(this.numSerie())
      ]);
      this.allEmployees.set(employees);
      const employeeMatriculas = new Set(employees.map(e => e.matricula));
      this.vinculadosSet.set(new Set(
        vinculados.map((v: FuncionarioRelogio) => v.matricula).filter(m => employeeMatriculas.has(m))
      ));
    } finally {
      this.isLoadingGerenciar.set(false);
    }
  }

  fecharGerenciar() {
    this.showGerenciar.set(false);
  }

  toggleVinculo(matricula: string) {
    this.vinculadosSet.update(set => {
      const novo = new Set(set);
      if (novo.has(matricula)) {
        novo.delete(matricula);
      } else {
        novo.add(matricula);
      }
      return novo;
    });
  }

  toggleSelectAllPage() {
    const page = this.paginatedEmployees();
    const vinc = this.vinculadosSet();
    const allSelected = page.every(e => vinc.has(e.matricula));
    this.vinculadosSet.update(set => {
      const novo = new Set(set);
      for (const e of page) {
        if (allSelected) {
          novo.delete(e.matricula);
        } else {
          novo.add(e.matricula);
        }
      }
      return novo;
    });
  }

  async salvarGerenciamento() {
    this.isSaving.set(true);
    try {
      const matriculas = Array.from(this.vinculadosSet());
      const result = await this.relogioService.gerenciarFuncionariosDoRelogio(this.numSerie(), matriculas);
      if (!result.success) {
        this.showFeedback('Erro ao salvar alterações', 'error');
        return;
      }
      this.showFeedback(
        result.apiVinculado
          ? `Sincronizado: ${result.adicionados} adicionado(s), ${result.removidos} removido(s)`
          : result.apiMessage || `Salvo localmente: ${result.adicionados} adicionado(s), ${result.removidos} removido(s)`,
        result.apiVinculado ? 'success' : 'error'
      );
      const data = await this.relogioService.getFuncionariosByRelogio(this.numSerie());
      this.allFuncionarios.set(data);
      this.showGerenciar.set(false);
    } catch {
      this.showFeedback('Erro ao salvar alterações', 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  async removerFuncionario(func: FuncionarioRelogio) {
    this.vinculadosSet.update(set => {
      const novo = new Set(set);
      novo.delete(func.matricula);
      return novo;
    });

    try {
      const result = await this.relogioService.removerFuncionarioDoRelogio(this.numSerie(), func.matricula);
      if (result.success) {
        this.allFuncionarios.update(list => list.filter(f => f.matricula !== func.matricula));
      }
      this.showFeedback(
        result.apiVinculado ? result.apiMessage : result.apiMessage || 'Funcionário removido apenas localmente',
        result.apiVinculado ? 'success' : 'error'
      );
    } finally {
    }
  }

  async openPreviewSincronizacao() {
    this.showPreviewSincronizacao.set(true);
    this.isLoadingPreview.set(true);
    this.previewAVincular.set([]);
    this.previewADesvincular.set([]);
    try {
      const result = await this.relogioService.previewSincronizarVinculosApi(this.numSerie());
      if (result.success) {
        this.previewAVincular.set(result.aVincular);
        this.previewADesvincular.set(result.aDesvincular);
      }
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  fecharPreviewSincronizacao() {
    this.showPreviewSincronizacao.set(false);
  }

  onPreviewSearchVincularChange(value: string) {
    this.previewSearchVincular.set(value);
  }

  onPreviewSearchDesvincularChange(value: string) {
    this.previewSearchDesvincular.set(value);
  }

  moverParaDesvincular(func: { matricula: string; nome: string }) {
    this.previewAVincular.update(list => list.filter(f => f.matricula !== func.matricula));
    this.previewADesvincular.update(list => {
      const novo = [...list, func];
      novo.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
      return novo;
    });
  }

  moverParaVincular(func: { matricula: string; nome: string }) {
    this.previewADesvincular.update(list => list.filter(f => f.matricula !== func.matricula));
    this.previewAVincular.update(list => {
      const novo = [...list, func];
      novo.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
      return novo;
    });
  }

  async confirmarSincronizacao() {
    this.showPreviewSincronizacao.set(false);
    this.isSincronizandoApi.set(true);
    try {
      const matriculasVincular = this.previewAVincular().map(f => f.matricula);
      const matriculasDesvincular = this.previewADesvincular().map(f => f.matricula);
      const result = await this.relogioService.sincronizarVinculosApi(this.numSerie(), matriculasVincular, matriculasDesvincular);
      this.showFeedback(
        result.message,
        result.success ? 'success' : 'error'
      );
      if (result.success) {
        const data = await this.relogioService.getFuncionariosByRelogio(this.numSerie());
        this.allFuncionarios.set(data);
      }
    } finally {
      this.isSincronizandoApi.set(false);
    }
  }

  onGerenciarSearchChange(value: string) {
    this.gerenciarSearchText.set(value);
    this.gerenciarCurrentPage.set(1);
  }

  toggleSomenteAtivos() {
    this.somenteAtivos.update(v => !v);
    this.gerenciarCurrentPage.set(1);
  }

  onEmpresaFilterChange(selected: string[]) {
    this.selectedEmpresas.set(selected);
    this.gerenciarCurrentPage.set(1);
  }

  onLocalFilterChange(selected: string[]) {
    this.selectedLocais.set(selected);
    this.gerenciarCurrentPage.set(1);
  }

  onGerenciarSort(col: SortColumn) {
    if (this.gerenciarSortColumn() === col) {
      this.gerenciarSortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.gerenciarSortColumn.set(col);
      this.gerenciarSortDirection.set('asc');
    }
    this.gerenciarCurrentPage.set(1);
  }

  onGerenciarPageChange(page: number) {
    this.gerenciarCurrentPage.set(page);
  }

  onGerenciarItemsPerPageChange(items: number) {
    this.gerenciarItemsPerPage.set(items);
    this.gerenciarCurrentPage.set(1);
  }
}
