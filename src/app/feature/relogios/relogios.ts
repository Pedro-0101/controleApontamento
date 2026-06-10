// src/app/feature/relogios/relogios.ts
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../core/services/relogio/relogio.service';
import { FuncionarioRelogioService } from '../../core/services/funcionario-relogio/funcionario-relogio.service';
import { Relogio } from '../../models/relogio/relogio';
import { Pagination } from '../../shared/pagination/pagination';
import { SearchFilter, FilterOption } from '../../shared/search-filter/search-filter';
import { RelogiosFuncionarios } from './relogios-funcionarios/relogios-funcionarios';

@Component({
  selector: 'app-relogios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, SearchFilter, RelogiosFuncionarios],
  templateUrl: './relogios.html',
  styleUrl: './relogios.css'
})
export class Relogios implements OnInit {
  private relogioService = inject(RelogioService);
  private funcionarioRelogioService = inject(FuncionarioRelogioService);

  activeTab = signal<'relogios' | 'funcionarios'>('relogios');
  allRelogios = signal<Relogio[]>([]);
  searchText = signal('');
  statusFilter = signal('all');
  currentPage = signal(1);
  itemsPerPage = signal(25);
  isLoading = signal(true);

  filterOptions = signal<FilterOption[]>([
    { label: 'Todos', value: 'all' },
    { label: 'Online', value: '4' },
    { label: 'Offline', value: 'offline' }
  ]);

  filteredRelogios = computed(() => {
    let result = this.allRelogios();

    const search = this.searchText().toLowerCase();
    if (search) {
      result = result.filter(r =>
        r.numSerie.toLowerCase().includes(search) ||
        r.descricao.toLowerCase().includes(search) ||
        r.type.toLowerCase().includes(search)
      );
    }

    const status = this.statusFilter();
    if (status === '4') {
      result = result.filter(r => r.status === 4);
    } else if (status === 'offline') {
      result = result.filter(r => r.status !== 4);
    }

    return result;
  });

  paginatedRelogios = computed(() => {
    const filtered = this.filteredRelogios();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return filtered.slice(start, start + this.itemsPerPage());
  });

  async ngOnInit() {
    await Promise.all([
      this.loadRelogios(),
      this.funcionarioRelogioService.load()
    ]);
  }

  async loadRelogios() {
    this.isLoading.set(true);
    try {
      const relogios = await this.relogioService.updateRelogios();
      this.allRelogios.set(relogios);
    } catch (error) {
      console.error('Erro ao carregar relógios:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearchChange(search: string) {
    this.searchText.set(search);
    this.currentPage.set(1);
  }

  onFilterChange(filter: string) {
    this.statusFilter.set(filter);
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
  }

  getStatusClass(status: number): string {
    return status === 4 ? 'status-online' : 'status-offline';
  }

  getStatusLabel(status: number): string {
    return status === 4 ? 'Online' : 'Offline';
  }
}
