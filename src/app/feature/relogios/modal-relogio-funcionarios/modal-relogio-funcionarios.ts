import { Component, EventEmitter, inject, input, OnInit, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../../core/services/relogio/relogio.service';
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
}
