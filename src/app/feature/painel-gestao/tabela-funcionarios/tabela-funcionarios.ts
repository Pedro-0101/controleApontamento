import { Component, computed, inject, signal } from '@angular/core';
import { LoggerService } from '../../../core/services/logger/logger.service';
import { MarcacaoService } from '../../../core/services/marcacao/marcacao.service';
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

  // Dados originais do serviço
  readonly _isLoadingMarcacoesPainel = this.marcacaoService._isLoadingMarcacoes;
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
  readonly sortColumn = signal<string>('nome');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly _sortedMarcacoes = computed(() => {
    const data = [...this._filteredMarcacoes()];
    const column = this.sortColumn();
    const direction = this.sortDirection();

    if (!column) return data;

    return data.sort((a, b) => {
      let valueA: any = (a as any)[column];
      let valueB: any = (b as any)[column];

      // Tratamento especial para métodos ou propriedades específicas
      if (column === 'data') {
        const dateA = a.data.includes('/') ? a.data.split('/') : a.data.split('-');
        const dateB = b.data.includes('/') ? b.data.split('/') : b.data.split('-');

        // Handle YYYY-MM-DD vs DD/MM/YYYY
        if (dateA[0].length === 4) {
          valueA = new Date(a.data).getTime();
          valueB = new Date(b.data).getTime();
        } else {
          valueA = new Date(`${dateA[2]}-${dateA[1]}-${dateA[0]}`).getTime();
          valueB = new Date(`${dateB[2]}-${dateB[1]}-${dateB[0]}`).getTime();
        }
      }

      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();

      if (valueA < valueB) return direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return direction === 'asc' ? 1 : -1;
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
    const startIndex = (page - 1) * limit;

    return data.slice(startIndex, startIndex + limit);
  });

  readonly _totalPages = computed(() => {
    return Math.ceil(this._filteredMarcacoes().length / this.itemsPerPage());
  });

  readonly _totalItems = computed(() => this._filteredMarcacoes().length);

  // --- Modal Detalhes ---
  readonly selectedRecord = signal<MarcacaoDia | null>(null);

  abrirDetalhes(item: MarcacaoDia) {
    this.selectedRecord.set(item);
  }

  fecharDetalhes() {
    this.selectedRecord.set(null);
  }

  recarregarDados() {
    this.marcacaoService.refreshMarcacoes();
  }

  // --- Modal Exportação ---
  readonly exibindoModalExportacao = signal(false);

  abrirModalExportacao() {
    this.exibindoModalExportacao.set(true);
  }

  fecharModalExportacao() {
    this.exibindoModalExportacao.set(false);
  }


  constructor() {
  }

  ngOnInit() {
    this.loadMarcacoes();
  }

  loadMarcacoes() {
    try {
      const todayRange = DateHelper.getTodayRange();
      this.marcacaoService.updateMarcacoes(todayRange.start, todayRange.end);
    } catch (error) {
      this.loggerService.error('TabelaFuncionarios', 'Erro', error);
    }
  }

  // --- Actions ---

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    this.currentPage.set(1); // Resetar para primeira página ao pesquisar
  }

  onSort(column: string) {
    if (this.sortColumn() === column) {
      // Alternar direção
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      // Nova coluna, default asc
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  onItemsPerPageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.itemsPerPage.set(Number(select.value));
    this.currentPage.set(1); // Resetar para primeira página
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

  nextPage() {
    if (this.currentPage() < this._totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }
}