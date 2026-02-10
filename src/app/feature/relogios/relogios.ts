import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../core/services/relogio/relogio.service';
import { Relogio } from '../../models/relogio/relogio';
import { Pagination } from '../../shared/pagination/pagination';
import { SearchFilter, FilterOption } from '../../shared/search-filter/search-filter';

@Component({
  selector: 'app-relogios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, SearchFilter],
  templateUrl: './relogios.html',
  styleUrl: './relogios.css'
})
export class Relogios implements OnInit {
  private relogioService = inject(RelogioService);

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

  // Filtered relogios based on search and filter
  filteredRelogios = computed(() => {
    let result = this.allRelogios();

    // Apply search filter
    const search = this.searchText().toLowerCase();
    if (search) {
      result = result.filter(r =>
        r.numSerie.toLowerCase().includes(search) ||
        r.descricao.toLowerCase().includes(search) ||
        r.type.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    const status = this.statusFilter();
    if (status === '4') {
      result = result.filter(r => r.status === 4);
    } else if (status === 'offline') {
      result = result.filter(r => r.status !== 4);
    }

    return result;
  });

  // Paginated relogios
  paginatedRelogios = computed(() => {
    const filtered = this.filteredRelogios();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    const end = start + this.itemsPerPage();
    return filtered.slice(start, end);
  });

  async ngOnInit() {
    await this.loadRelogios();
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
