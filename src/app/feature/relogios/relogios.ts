import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { RelogioService } from '../../core/services/relogio/relogio.service';
import { MarcacaoApiService } from '../../core/services/marcacao-api/marcacao-api.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { Relogio } from '../../models/relogio/relogio';
import { Pagination } from '../../shared/pagination/pagination';
import { RangeSlider, RangeValue } from '../../shared/range-slider/range-slider';
import { RelogiosFuncionarios } from './relogios-funcionarios/relogios-funcionarios';
import { ModalRelogioFuncionarios } from './modal-relogio-funcionarios/modal-relogio-funcionarios';
import { ModalPreviewResync } from './modal-preview-resync/modal-preview-resync';

interface FuncionarioAnalise {
  matricula: string;
  nome: string;
  ultimaBatida: Date;
  selecionado: boolean;
}

interface RelogioAnalise {
  numSerie: string;
  descricao: string;
  status: number;
  dataCriacao: string;
  funcionarios: FuncionarioAnalise[];
}

@Component({
  selector: 'app-relogios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, Pagination, RangeSlider, RelogiosFuncionarios, ModalRelogioFuncionarios, ModalPreviewResync],
  templateUrl: './relogios.html',
  styleUrl: './relogios.css'
})
export class Relogios implements OnInit {
  private relogioService = inject(RelogioService);
  private marcacaoApiService = inject(MarcacaoApiService);
  private employeeService = inject(EmployeeService);
  private http = inject(HttpClient);

  activeTab = signal<'relogios' | 'funcionarios' | 'reestruturar'>('relogios');
  allRelogios = signal<Relogio[]>([]);
  currentPage = signal(1);
  itemsPerPage = signal(10);
  isLoading = signal(true);

  funcionariosPorRelogio = signal<Map<string, number>>(new Map());
  isLoadingCounts = signal(false);
  minFuncionariosFilter = signal(0);
  maxFuncionariosFilter = signal(50);
  searchTableRelogios = signal('');
  somenteAtivos = signal(true);
  sortColumn = signal<'numSerie' | 'descricao' | 'funcionarios' | 'dataCriacao' | null>(null);
  sortDirection = signal<'asc' | 'desc'>('asc');
  checkedRelogios = signal<Set<string>>(new Set());
  isBulkToggling = signal(false);
  isResyncing = signal(false);
  showPreviewModal = signal(false);

  allFilteredChecked = computed(() => {
    const filtered = this.filteredRelogios();
    if (filtered.length === 0) return false;
    return filtered.every(r => this.checkedRelogios().has(r.numSerie));
  });

  checkedCount = computed(() => this.checkedRelogios().size);

  checkedSeries = computed(() => [...this.checkedRelogios()]);

  descricoesRelogios = computed(() => {
    const map = new Map<string, string>();
    for (const r of this.allRelogios()) {
      map.set(r.numSerie, r.descricao || 'Sem descrição');
    }
    return map;
  });

  logLines = signal<string[]>([]);
  isAnalyzing = signal(false);
  analiseState = signal<'idle' | 'analyzing' | 'confirmando' | 'aplicado'>('idle');
  analiseResultados = signal<RelogioAnalise[]>([]);
  relogiosSelecionados = signal<Set<string>>(new Set());
  searchRelogios = signal('');
  isApplying = signal(false);
  diasAnalise = signal(30);
  private cancelRequested = false;

  searchFuncionarioConfirmacao = signal('');

  selectedRelogioNumSerie = signal<string | null>(null);
  selectedRelogioDescricao = signal<string | null>(null);

  readonly maxFuncionariosSlider = 50;

  totalRelogiosAtivos = computed(() => this.allRelogios().filter(r => r.ativo).length);

  filteredRelogios = computed(() => {
    let result = this.allRelogios();
    const countMap = this.funcionariosPorRelogio();

    const search = this.searchTableRelogios().toLowerCase().trim();
    if (search) {
      result = result.filter(r =>
        r.descricao.toLowerCase().includes(search) ||
        r.numSerie.toLowerCase().includes(search)
      );
    }

    if (this.somenteAtivos()) {
      result = result.filter(r => r.ativo);
    }

    const min = this.minFuncionariosFilter();
    const max = this.maxFuncionariosFilter();
    if (min > 0 || max < this.maxFuncionariosSlider) {
      result = result.filter(r => {
        const key = this.relogioService.normalizeNumSerie(r.numSerie);
        const count = countMap.get(key) ?? 0;
        return count >= min && count <= max;
      });
    }

    const col = this.sortColumn();
    if (col) {
      const dir = this.sortDirection() === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        let va: any, vb: any;
        switch (col) {
          case 'numSerie':
            va = this.relogioService.normalizeNumSerie(a.numSerie);
            vb = this.relogioService.normalizeNumSerie(b.numSerie);
            break;
          case 'descricao':
            va = a.descricao.toLowerCase();
            vb = b.descricao.toLowerCase();
            break;
          case 'funcionarios':
            va = countMap.get(this.relogioService.normalizeNumSerie(a.numSerie)) ?? 0;
            vb = countMap.get(this.relogioService.normalizeNumSerie(b.numSerie)) ?? 0;
            break;
          case 'dataCriacao':
            va = a.dataCriacao || '';
            vb = b.dataCriacao || '';
            break;
          default:
            return 0;
        }
        if (typeof va === 'string' && typeof vb === 'string') {
          return va.localeCompare(vb) * dir;
        }
        return ((va as number) - (vb as number)) * dir;
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
    this.loadFuncionariosCount();
  }

  async loadRelogios() {
    this.isLoading.set(true);
    try {
      const relogios = await this.relogioService.updateRelogios();
      await this.relogioService.mergeLocalStatus(relogios);
      this.allRelogios.set(relogios);
      this.relogiosSelecionados.set(new Set(relogios.filter(r => r.ativo).map(r => r.numSerie)));
    } catch (error) {
      console.error('Erro ao carregar relógios:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadFuncionariosCount() {
    this.isLoadingCounts.set(true);
    try {
      const counts = await this.relogioService.getFuncionariosCountFromDB();
      this.funcionariosPorRelogio.set(counts);
    } catch (error) {
      console.error('[Relogios] Erro ao carregar contagem do banco:', error);
    } finally {
      this.isLoadingCounts.set(false);
    }
  }

  async toggleAtivoRelogio(numSerie: string) {
    const relogio = this.allRelogios().find(r => r.numSerie === numSerie);
    if (!relogio) return;

    const novoAtivo = !relogio.ativo;
    const ok = await this.relogioService.toggleAtivo(numSerie, novoAtivo);
    if (!ok) return;

    relogio.ativo = novoAtivo;
    this.allRelogios.update(relogios => [...relogios]);

    if (!novoAtivo) {
      this.relogiosSelecionados.update(set => {
        const novo = new Set(set);
        novo.delete(numSerie);
        return novo;
      });
    } else {
      this.relogiosSelecionados.update(set => {
        const novo = new Set(set);
        novo.add(numSerie);
        return novo;
      });
    }
  }

  toggleCheckRelogio(numSerie: string) {
    this.checkedRelogios.update(set => {
      const novo = new Set(set);
      if (novo.has(numSerie)) {
        novo.delete(numSerie);
      } else {
        novo.add(numSerie);
      }
      return novo;
    });
  }

  toggleCheckAllFiltered() {
    if (this.allFilteredChecked()) {
      this.checkedRelogios.set(new Set());
    } else {
      this.checkedRelogios.set(new Set(this.filteredRelogios().map(r => r.numSerie)));
    }
  }

  async ativarSelecionados() {
    const checked = [...this.checkedRelogios()];
    if (checked.length === 0) return;

    this.isBulkToggling.set(true);
    try {
      const ok = await this.relogioService.toggleAtivoBulk(checked, true);
      if (!ok) return;

      this.allRelogios.update(relogios => {
        for (const r of relogios) {
          if (checked.includes(r.numSerie)) r.ativo = true;
        }
        return [...relogios];
      });

      this.relogiosSelecionados.update(set => {
        const novo = new Set(set);
        for (const ns of checked) novo.add(ns);
        return novo;
      });

      this.checkedRelogios.set(new Set());
    } finally {
      this.isBulkToggling.set(false);
    }
  }

  async resyncSelecionados() {
    const checked = [...this.checkedRelogios()];
    if (checked.length === 0) return;

    this.isResyncing.set(true);
    try {
      const result = await this.relogioService.resyncRelogios(checked);
      if (result.success) {
        this.loadFuncionariosCount();
        this.checkedRelogios.set(new Set());
      }
    } finally {
      this.isResyncing.set(false);
    }
  }

  async desativarSelecionados() {
    const checked = [...this.checkedRelogios()];
    if (checked.length === 0) return;

    this.isBulkToggling.set(true);
    try {
      const ok = await this.relogioService.toggleAtivoBulk(checked, false);
      if (!ok) return;

      this.allRelogios.update(relogios => {
        for (const r of relogios) {
          if (checked.includes(r.numSerie)) r.ativo = false;
        }
        return [...relogios];
      });

      this.relogiosSelecionados.update(set => {
        const novo = new Set(set);
        for (const ns of checked) novo.delete(ns);
        return novo;
      });

      this.checkedRelogios.set(new Set());
    } finally {
      this.isBulkToggling.set(false);
    }
  }

  onMinFuncionariosChange(range: RangeValue) {
    this.minFuncionariosFilter.set(range.min);
    this.maxFuncionariosFilter.set(range.max);
    this.currentPage.set(1);
  }

  onSortColumn(col: 'numSerie' | 'descricao' | 'funcionarios' | 'dataCriacao') {
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

  onDiasAnaliseChange(dias: string) {
    const valor = parseInt(dias, 10);
    if (isNaN(valor) || valor < 1) {
      this.diasAnalise.set(1);
    } else if (valor > 500) {
      this.diasAnalise.set(500);
    } else {
      this.diasAnalise.set(valor);
    }
  }

  toggleRelogioSelecionado(numSerie: string) {
    this.relogiosSelecionados.update(set => {
      const novo = new Set(set);
      if (novo.has(numSerie)) {
        novo.delete(numSerie);
      } else {
        novo.add(numSerie);
      }
      return novo;
    });
  }

  selecionarTodosRelogios(selecionar: boolean) {
    const alvo = this.relogiosFiltradosSelecao().map(r => r.numSerie);
    this.relogiosSelecionados.update(set => {
      const novo = new Set(set);
      if (selecionar) {
        for (const ns of alvo) novo.add(ns);
      } else {
        for (const ns of alvo) novo.delete(ns);
      }
      return novo;
    });
  }

  getRelogiosSelecionadosCount(): number {
    return this.relogiosSelecionados().size;
  }

  relogiosFiltradosSelecao = computed(() => {
    const search = this.searchRelogios().toLowerCase().trim();
    let base = this.allRelogios().filter(r => r.ativo);
    if (!search) return base;
    return base.filter(r =>
      r.descricao.toLowerCase().includes(search) ||
      r.numSerie.toLowerCase().includes(search)
    );
  });

  analiseResultadosFiltrados = computed(() => {
    const search = this.searchFuncionarioConfirmacao().toLowerCase().trim();
    if (!search) return this.analiseResultados();

    return this.analiseResultados()
      .map(r => ({
        ...r,
        funcionarios: r.funcionarios.filter(f =>
          f.matricula.toLowerCase().includes(search) ||
          f.nome.toLowerCase().includes(search)
        )
      }))
      .filter(r => r.funcionarios.length > 0);
  });

  onSearchTableRelogiosChange(value: string) {
    this.searchTableRelogios.set(value);
    this.currentPage.set(1);
  }

  async iniciarAnalise() {
    this.isAnalyzing.set(true);
    this.analiseState.set('analyzing');
    this.cancelRequested = false;
    this.logLines.set([]);
    this.analiseResultados.set([]);

    const addLog = (msg: string) => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      this.logLines.update(lines => [...lines, `[${time}] ${msg}`]);
    };

    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - this.diasAnalise());

    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const fmtDateTime = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    addLog(`=== INICIANDO ANÁLISE DE VÍNCULOS ===`);
    addLog(`Período: ${fmt(inicio)} a ${fmt(hoje)} (${this.diasAnalise()} dias)`);
    addLog(``);

    let relogios = this.allRelogios();
    if (relogios.length === 0) {
      addLog(`Relógios não carregados. Buscando...`);
      try {
        relogios = await this.relogioService.updateRelogios();
        this.allRelogios.set(relogios);
      } catch (e) {
        addLog(`ERRO ao carregar relógios: ${e}`);
        this.isAnalyzing.set(false);
        this.analiseState.set('idle');
        return;
      }
    }

    if (relogios.length === 0) {
      addLog(`Nenhum relógio cadastrado.`);
      this.isAnalyzing.set(false);
      this.analiseState.set('idle');
      return;
    }

    const selecionados = this.relogiosSelecionados();
    relogios = relogios.filter(r => selecionados.has(r.numSerie));

    if (relogios.length === 0) {
      addLog(`Nenhum relógio selecionado.`);
      this.isAnalyzing.set(false);
      this.analiseState.set('idle');
      return;
    }

    addLog(`Total de relógios a analisar: ${relogios.length}`);
    addLog(``);

    let totalFuncionariosGeral = new Set<string>();
    let totalRelogiosComMarcacao = 0;
    const resultados: RelogioAnalise[] = [];

    try {
      for (let i = 0; i < relogios.length; i++) {
        if (this.cancelRequested) {
          addLog(``);
          addLog(`=== ANÁLISE CANCELADA PELO USUÁRIO ===`);
          addLog(`Relógios analisados: ${i}/${relogios.length}`);
          break;
        }

        const relogio = relogios[i];
        addLog(`[${i + 1}/${relogios.length}] Buscando: ${relogio.descricao || 'Sem descrição'} (SN: ${relogio.numSerie})`);

        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }

        const marcacoes = await this.marcacaoApiService.getMarcacoesByRelogio(
          relogio.numSerie,
          fmt(inicio),
          fmt(hoje)
        );

        if (this.cancelRequested) {
          addLog(``);
          addLog(`=== ANÁLISE CANCELADA PELO USUÁRIO ===`);
          addLog(`Relógios analisados: ${i + 1}/${relogios.length}`);
          break;
        }

        const funcionariosPorMatricula = new Map<string, { ultimaBatida: Date }>();

        for (const m of marcacoes) {
          const mat = m.matriculaFuncionario?.trim();
          if (!mat) continue;
          totalFuncionariosGeral.add(mat);

          const batida = m.dataMarcacao instanceof Date ? m.dataMarcacao : new Date(m.dataMarcacao);
          const existente = funcionariosPorMatricula.get(mat);
          if (!existente || batida.getTime() > existente.ultimaBatida.getTime()) {
            funcionariosPorMatricula.set(mat, { ultimaBatida: batida });
          }
        }

        const matriculas = Array.from(funcionariosPorMatricula.keys());
        const nomesMap = new Map<string, string>();
        if (matriculas.length > 0) {
          try {
            const nomes = await this.employeeService.getEmployeeNamesBatch(matriculas);
            for (const n of nomes) {
              nomesMap.set(n.matricula, n.nome);
            }
          } catch {
            // segui sem nomes se falhar
          }
        }

        const funcionarios: FuncionarioAnalise[] = [];
        if (marcacoes.length > 0) {
          totalRelogiosComMarcacao++;
          const entradas = Array.from(funcionariosPorMatricula.entries());
          entradas.sort((a, b) => b[1].ultimaBatida.getTime() - a[1].ultimaBatida.getTime());

          for (const [matricula, dados] of entradas) {
            const nome = nomesMap.get(matricula) || '';
            funcionarios.push({
              matricula,
              nome,
              ultimaBatida: dados.ultimaBatida,
              selecionado: true
            });
          }

          addLog(`  Funcionários que bateram: ${funcionarios.length}`);
          for (const f of funcionarios) {
            addLog(`    Matrícula: ${f.matricula} | ${f.nome ? f.nome + ' | ' : ''}Última batida: ${fmtDateTime(f.ultimaBatida)}`);
          }
          addLog(`  → Total: ${funcionarios.length} funcionário(s)`);
        } else {
          addLog(`  Nenhuma marcação neste período.`);
        }

        addLog(``);

        resultados.push({
          numSerie: relogio.numSerie,
          descricao: relogio.descricao || 'Sem descrição',
          status: relogio.status,
          dataCriacao: relogio.dataCriacao,
          funcionarios
        });
      }

      if (!this.cancelRequested) {
        addLog(`──────────────────────────────────────────`);
        addLog(`=== ANÁLISE CONCLUÍDA ===`);
        addLog(`Relógios com marcações: ${totalRelogiosComMarcacao}/${relogios.length}`);
        addLog(`Total de funcionários únicos: ${totalFuncionariosGeral.size}`);
        addLog(``);
        addLog(`Aguardando confirmação para aplicar vínculos...`);
      }
    } catch (error) {
      addLog(`ERRO: ${error}`);
    } finally {
      this.isAnalyzing.set(false);
      const wasCancelled = this.cancelRequested;
      this.cancelRequested = false;

      if (!wasCancelled) {
        this.analiseResultados.set([...resultados]);
        this.analiseState.set('confirmando');
      } else {
        this.analiseState.set('idle');
      }
    }
  }

  cancelarAnalise() {
    this.cancelRequested = true;
  }

  toggleFuncionario(numSerie: string, matricula: string) {
    this.analiseResultados.update(resultados =>
      resultados.map(r => {
        if (r.numSerie !== numSerie) return r;
        return {
          ...r,
          funcionarios: r.funcionarios.map(f =>
            f.matricula === matricula ? { ...f, selecionado: !f.selecionado } : f
          )
        };
      })
    );
  }

  selecionarTodosRelogio(numSerie: string, selecionar: boolean) {
    this.analiseResultados.update(resultados =>
      resultados.map(r => {
        if (r.numSerie !== numSerie) return r;
        return {
          ...r,
          funcionarios: r.funcionarios.map(f => ({ ...f, selecionado: selecionar }))
        };
      })
    );
  }

  getSelecionadosCount(numSerie: string): number {
    const r = this.analiseResultados().find(r => r.numSerie === numSerie);
    if (!r) return 0;
    return r.funcionarios.filter(f => f.selecionado).length;
  }

  getTotalSelecionados(): number {
    let total = 0;
    for (const r of this.analiseResultados()) {
      total += r.funcionarios.filter(f => f.selecionado).length;
    }
    return total;
  }

  voltarAnalise() {
    this.analiseState.set('idle');
    this.analiseResultados.set([]);
    this.logLines.set([]);
  }

  openFuncionariosModal(numSerie: string, descricao: string) {
    this.selectedRelogioNumSerie.set(numSerie);
    this.selectedRelogioDescricao.set(descricao);
  }

  closeFuncionariosModal() {
    this.selectedRelogioNumSerie.set(null);
    this.selectedRelogioDescricao.set(null);
  }

  openPreviewResync() {
    this.showPreviewModal.set(true);
  }

  closePreviewResync() {
    this.showPreviewModal.set(false);
  }

  async onConfirmResync() {
    this.showPreviewModal.set(false);
    await this.resyncSelecionados();
  }

  async confirmarVinculacao() {
    this.isApplying.set(true);

    const payload = {
      relogios: this.analiseResultados().map(r => ({
        num_serie: r.numSerie,
        descricao: r.descricao,
        status: r.status,
        data_criacao: r.dataCriacao,
        matriculas: r.funcionarios.filter(f => f.selecionado).map(f => f.matricula)
      }))
    };

    try {
      const resp = await firstValueFrom(
        this.http.post<{
          success: boolean;
          relogios_atualizados: number;
          vinculos_ativados: number;
          vinculos_inativados: number;
          error?: string;
        }>('/api/relogios/analise-vinculo', payload)
      );

      if (resp.success) {
        this.analiseState.set('aplicado');
        this.loadFuncionariosCount();
        this.logLines.update(lines => [
          ...lines,
          ``,
          `=== VÍNCULOS APLICADOS COM SUCESSO ===`,
          `Relógios atualizados: ${resp.relogios_atualizados}`,
          `Vínculos ativados: ${resp.vinculos_ativados}`,
          `Vínculos inativados: ${resp.vinculos_inativados}`
        ]);
      } else {
        this.logLines.update(lines => [
          ...lines,
          ``,
          `ERRO ao aplicar vínculos: ${resp.error || 'Erro desconhecido'}`
        ]);
      }
    } catch (error) {
      this.logLines.update(lines => [
        ...lines,
        ``,
        `ERRO ao aplicar vínculos: ${error}`
      ]);
    } finally {
      this.isApplying.set(false);
    }
  }
}
