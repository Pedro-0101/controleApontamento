// src/app/feature/relogios/relogios.ts
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../core/services/relogio/relogio.service';
import { MarcacaoApiService } from '../../core/services/marcacao-api/marcacao-api.service';
import { Relogio } from '../../models/relogio/relogio';
import { Pagination } from '../../shared/pagination/pagination';
import { SearchFilter, FilterOption } from '../../shared/search-filter/search-filter';
import { RangeSlider, RangeValue } from '../../shared/range-slider/range-slider';
import { RelogiosFuncionarios } from './relogios-funcionarios/relogios-funcionarios';

@Component({
  selector: 'app-relogios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, SearchFilter, RangeSlider, RelogiosFuncionarios],
  templateUrl: './relogios.html',
  styleUrl: './relogios.css'
})
export class Relogios implements OnInit {
  private relogioService = inject(RelogioService);
  private marcacaoApiService = inject(MarcacaoApiService);

  activeTab = signal<'relogios' | 'funcionarios'>('relogios');
  allRelogios = signal<Relogio[]>([]);
  searchText = signal('');
  statusFilter = signal('all');
  currentPage = signal(1);
  itemsPerPage = signal(10);
  isLoading = signal(true);

  funcionariosPorRelogio = signal<Map<string, number>>(new Map());
  pendingCounts = signal<Set<string>>(new Set());
  minFuncionariosFilter = signal(0);

  readonly maxFuncionariosSlider = 50;

  filterOptions = signal<FilterOption[]>([
    { label: 'Todos', value: 'all' },
    { label: 'Online', value: '4' },
    { label: 'Offline', value: 'offline' }
  ]);

  filteredRelogios = computed(() => {
    let result = this.allRelogios();
    const countMap = this.funcionariosPorRelogio();

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

    const min = this.minFuncionariosFilter();
    if (min > 0) {
      result = result.filter(r => {
        const key = this.relogioService.normalizeNumSerie(r.numSerie);
        return (countMap.get(key) ?? 0) >= min;
      });
    }

    return result;
  });

  paginatedRelogios = computed(() => {
    const filtered = this.filteredRelogios();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return filtered.slice(start, start + this.itemsPerPage());
  });

  getFuncionariosCount(numSerie: string): number {
    const key = this.relogioService.normalizeNumSerie(numSerie);
    return this.funcionariosPorRelogio().get(key) ?? 0;
  }

  async ngOnInit() {
    await this.loadRelogios();
    this.loadCountForPage();
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

  private async loadCountForPage() {
    const relogios = this.paginatedRelogios();
    if (relogios.length === 0) return;

    const existing = this.funcionariosPorRelogio();

    const toFetch = relogios.filter(r => !existing.has(this.relogioService.normalizeNumSerie(r.numSerie)));
    if (toFetch.length === 0) return;

    const pending = new Set(this.pendingCounts());
    for (const r of toFetch) pending.add(r.numSerie);
    this.pendingCounts.set(pending);

    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 7);

    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    try {
      const newMap = new Map(existing);

      for (const relogio of toFetch) {
        const marcacoes = await this.marcacaoApiService.getMarcacoesByRelogio(
          relogio.numSerie,
          fmt(inicio),
          fmt(hoje)
        );

        const matriculasUnicas = new Set<string>();
        for (const m of marcacoes) {
          const mat = m.matriculaFuncionario?.trim();
          if (mat) matriculasUnicas.add(mat);
        }

        const key = this.relogioService.normalizeNumSerie(relogio.numSerie);
        newMap.set(key, matriculasUnicas.size);
      }

      this.funcionariosPorRelogio.set(newMap);
    } catch (error) {
      console.error('[Relogios] Erro ao carregar contagem:', error);
    } finally {
      const done = new Set(this.pendingCounts());
      for (const r of toFetch) done.delete(r.numSerie);
      this.pendingCounts.set(done);
    }
  }

  onSearchChange(search: string) {
    this.searchText.set(search);
    this.currentPage.set(1);
    this.loadCountForPage();
  }

  onFilterChange(filter: string) {
    this.statusFilter.set(filter);
    this.currentPage.set(1);
    this.loadCountForPage();
  }

  onMinFuncionariosChange(range: RangeValue) {
    this.minFuncionariosFilter.set(range.min);
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
    this.loadCountForPage();
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
    this.loadCountForPage();
  }

  getStatusClass(status: number): string {
    return status === 4 ? 'status-online' : 'status-offline';
  }

  getStatusLabel(status: number): string {
    return status === 4 ? 'Online' : 'Offline';
  }
}
