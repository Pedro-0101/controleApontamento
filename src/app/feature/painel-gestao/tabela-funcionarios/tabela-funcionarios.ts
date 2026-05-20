import { Component, computed, inject, signal } from '@angular/core';
import { LoggerService } from '../../../core/services/logger/logger.service';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { DateHelper } from '../../../core/helpers/dateHelper';

import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';
import { LinhaTabelaMarcacoes } from './linha-tabela-marcacoes/linha-tabela-marcacoes';
import { ModalExportacaoComponent } from './modal-exportacao/modal-exportacao';
import { ModalDetalhesMarcacaoComponent } from './modal-detalhes-marcacao/modal-detalhes-marcacao';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-tabela-funcionarios',
  imports: [LinhaTabelaMarcacoes, ModalExportacaoComponent, ModalDetalhesMarcacaoComponent, LucideAngularModule],
  templateUrl: './tabela-funcionarios.html',
  styleUrl: './tabela-funcionarios.css',
})
export class TabelaFuncionarios {

  private loggerService = inject(LoggerService);
  private marcacaoService = inject(MarcacaoService);
  private toastService = inject(ToastService);

  // Dados originais do serviço
  readonly _isLoadingMarcacoesPainel = this.marcacaoService._isLoadingMarcacoes;
  readonly _isBackgroundRefreshing = this.marcacaoService._isBackgroundRefreshing;
  readonly _marcacoesDiaTabelaPainel = this.marcacaoService._marcacoesFiltradas;

  // --- Filtro (Pesquisa) ---
  readonly searchQuery = signal('');

  readonly _filteredMarcacoes = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const data = this._marcacoesDiaTabelaPainel();

    if (!query) return data;

    return data.filter(item =>
      item.nome.toLowerCase().includes(query) ||
      item.matricula.toLowerCase().includes(query) ||
      item.cpf.includes(query)
    );
  });

  // --- Ordenação ---
  readonly sortColumn = signal<string>('data');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  readonly _sortedMarcacoes = computed(() => {
    const data = [...this._filteredMarcacoes()];
    const column = this.sortColumn();
    const direction = this.sortDirection();

    if (!column) return data;

    return data.sort((a, b) => {
      let valueA: any = (a as any)[column];
      let valueB: any = (b as any)[column];

      if (column === 'data') {
        const dateA = a.data.includes('/') ? a.data.split('/') : a.data.split('-');
        const dateB = b.data.includes('/') ? b.data.split('/') : b.data.split('-');
        if (dateA[0].length === 4) {
          valueA = new Date(a.data).getTime();
          valueB = new Date(b.data).getTime();
        } else {
          valueA = new Date(`${dateA[2]}-${dateA[1]}-${dateA[0]}`).getTime();
          valueB = new Date(`${dateB[2]}-${dateB[1]}-${dateB[0]}`).getTime();
        }
      }

      if (column === 'totalHoras') {
        valueA = a.getWorkedMinutes();
        valueB = b.getWorkedMinutes();
      }

      if (column === 'almoco') {
        const ativasA = a.marcacoes.filter(m => !m.desconsiderado);
        const ativasB = b.marcacoes.filter(m => !m.desconsiderado);
        valueA = ativasA.length === 4 ? Math.floor((ativasA[2].dataMarcacao.getTime() - ativasA[1].dataMarcacao.getTime()) / 60000) : -1;
        valueB = ativasB.length === 4 ? Math.floor((ativasB[2].dataMarcacao.getTime() - ativasB[1].dataMarcacao.getTime()) / 60000) : -1;
      }

      if (column === 'saldo') {
        const sA = a.getSaldoMinutos();
        const sB = b.getSaldoMinutos();
        if (sA === null && sB === null) return a.nome.localeCompare(b.nome);
        if (sA === null) return 1;
        if (sB === null) return -1;
        valueA = sA;
        valueB = sB;
      }

      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();

      if (valueA < valueB) return direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return direction === 'asc' ? 1 : -1;

      const nomeA = a.nome.toLowerCase();
      const nomeB = b.nome.toLowerCase();
      if (nomeA < nomeB) return -1;
      if (nomeA > nomeB) return 1;
      return 0;
    });
  });

  // --- Paginação ---
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly itemsPerPageOptions = [5, 10, 20, 50, 100];

  readonly _paginatedMarcacoes = computed(() => {
    const data = this._sortedMarcacoes();
    const page = this.currentPage();
    const limit = this.itemsPerPage();
    return data.slice((page - 1) * limit, page * limit);
  });

  readonly _totalPages = computed(() =>
    Math.ceil(this._filteredMarcacoes().length / this.itemsPerPage())
  );

  readonly _totalItems = computed(() => this._filteredMarcacoes().length);

  // Skeleton rows for loading state
  readonly skeletonRows = Array.from({ length: 10 }, (_, i) => i);

  // --- Modal Detalhes ---
  readonly selectedRecord = signal<MarcacaoDia | null>(null);

  abrirDetalhes(item: MarcacaoDia) {
    this.selectedRecord.set(item);
  }

  fecharDetalhes() {
    this.selectedRecord.set(null);
  }

  async recarregarDados() {
    this.loggerService.info('TabelaFuncionarios', 'Recarregando dados em background após alteração no modal');
    const atual = this.selectedRecord();
    await this.marcacaoService.backgroundRefreshMarcacoes();

    if (atual) {
      const novo = this._marcacoesDiaTabelaPainel().find(m =>
        m.matricula === atual.matricula && m.data === atual.data
      );
      if (novo) {
        this.loggerService.info('TabelaFuncionarios', 'Sincronizando record do modal');
        this.selectedRecord.set(novo);
      }
    }
  }

  // --- Modal Exportação ---
  readonly exibindoModalExportacao = signal(false);

  abrirModalExportacao() { this.exibindoModalExportacao.set(true); }
  fecharModalExportacao() { this.exibindoModalExportacao.set(false); }

  // ── Seleção em lote ──────────────────────────────────────────────────────

  readonly selectedKeys = signal<Set<string>>(new Set());
  readonly selectedAction = signal('Falta Confirmada');
  readonly isApplyingBulk = signal(false);

  readonly bulkActions = [
    'Falta Confirmada',
    'Atraso Confirmado',
    'Corrigido',
    'Folga',
    'BH',
  ];

  readonly isAllPageSelected = computed(() => {
    const keys = this.selectedKeys();
    const page = this._paginatedMarcacoes();
    return page.length > 0 && page.every(item => keys.has(`${item.matricula}:${item.data}`));
  });

  readonly isSomePageSelected = computed(() => {
    const keys = this.selectedKeys();
    const page = this._paginatedMarcacoes();
    return page.some(item => keys.has(`${item.matricula}:${item.data}`)) && !this.isAllPageSelected();
  });

  itemKey(item: MarcacaoDia): string {
    return `${item.matricula}:${item.data}`;
  }

  isItemSelected(item: MarcacaoDia): boolean {
    return this.selectedKeys().has(this.itemKey(item));
  }

  toggleSelectItem(key: string): void {
    const next = new Set(this.selectedKeys());
    next.has(key) ? next.delete(key) : next.add(key);
    this.selectedKeys.set(next);
  }

  toggleSelectAll(): void {
    const next = new Set(this.selectedKeys());
    const page = this._paginatedMarcacoes();
    if (this.isAllPageSelected()) {
      page.forEach(item => next.delete(this.itemKey(item)));
    } else {
      page.forEach(item => next.add(this.itemKey(item)));
    }
    this.selectedKeys.set(next);
  }

  clearSelection(): void {
    this.selectedKeys.set(new Set());
  }

  async applyBulkAction(): Promise<void> {
    const keys = this.selectedKeys();
    if (keys.size === 0) return;

    this.isApplyingBulk.set(true);
    const action = this.selectedAction();
    const allData = this._marcacoesDiaTabelaPainel();
    const selected = allData.filter(m => keys.has(this.itemKey(m)));

    try {
      await Promise.all(selected.map(md => {
        const isoDate = DateHelper.toIsoDate(md.data);
        return this.marcacaoService.saveEvent(md.matricula, isoDate, isoDate, action, 'FIXO');
      }));
      this.toastService.success(`"${action}" aplicado em ${selected.length} registro(s).`);
      this.clearSelection();
      await this.marcacaoService.backgroundRefreshMarcacoes();
    } catch (error) {
      this.toastService.error('Erro ao aplicar ação em lote.');
    } finally {
      this.isApplyingBulk.set(false);
    }
  }

  constructor() {}

  ngOnInit() {
    // Dados são carregados pelo componente pai (PainelGestao) via navegação de dia
  }

  // --- Actions ---

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    this.currentPage.set(1);
  }

  onSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  onItemsPerPageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.itemsPerPage.set(Number(select.value));
    this.currentPage.set(1);
  }

  prevPage() {
    if (this.currentPage() > 1) this.currentPage.update(p => p - 1);
  }

  nextPage() {
    if (this.currentPage() < this._totalPages()) this.currentPage.update(p => p + 1);
  }
}
