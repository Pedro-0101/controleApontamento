import { Component, EventEmitter, inject, input, OnInit, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../../core/services/relogio/relogio.service';
import { EmployeeService } from '../../../core/services/employee/employee.service';
import { Pagination } from '../../../shared/pagination/pagination';
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
  imports: [CommonModule, LucideAngularModule, Pagination, TitleCaseCustomPipe],
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

  showAddForm = signal(false);
  novaMatricula = signal('');
  isAdding = signal(false);
  addError = signal('');
  isRemoving = signal<Set<string>>(new Set());
  feedbackMessage = signal('');
  feedbackType = signal<'success' | 'error'>('success');
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

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

  toggleAddForm() {
    this.showAddForm.update(v => !v);
    this.novaMatricula.set('');
    this.addError.set('');
  }

  cancelarAdd() {
    this.showAddForm.set(false);
    this.novaMatricula.set('');
    this.addError.set('');
  }

  async adicionarFuncionario() {
    const matricula = this.novaMatricula().trim();
    if (!matricula) return;

    this.isAdding.set(true);
    this.addError.set('');

    try {
      const result = await this.relogioService.adicionarFuncionarioAoRelogio(this.numSerie(), matricula);
      if (!result.success) {
        this.addError.set('Erro ao adicionar funcionário');
        return;
      }

      this.showFeedback(
        result.apiVinculado ? result.apiMessage : result.apiMessage || 'Funcionário adicionado apenas localmente',
        result.apiVinculado ? 'success' : 'error'
      );

      const emp = await this.employeeService.getEmployeeByMatricula(matricula);
      const novo: FuncionarioRelogio = {
        matricula,
        nome: emp?.nome ?? '',
        empresa: emp?.empresa ?? '',
        local: emp?.local ?? '',
        cargo: emp?.cargo ?? ''
      };

      this.allFuncionarios.update(list => {
        const filtered = list.filter(f => f.matricula !== matricula);
        return [...filtered, novo];
      });

      this.showAddForm.set(false);
      this.novaMatricula.set('');
    } catch {
      this.addError.set('Erro ao adicionar funcionário');
    } finally {
      this.isAdding.set(false);
    }
  }

  async removerFuncionario(func: FuncionarioRelogio) {
    this.isRemoving.update(set => {
      const novo = new Set(set);
      novo.add(func.matricula);
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
      this.isRemoving.update(set => {
        const novo = new Set(set);
        novo.delete(func.matricula);
        return novo;
      });
    }
  }
}
