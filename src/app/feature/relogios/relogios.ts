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
  imports: [CommonModule, LucideAngularModule, Pagination, RangeSlider, RelogiosFuncionarios],
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
  pendingCounts = signal<Set<string>>(new Set());
  minFuncionariosFilter = signal(0);
  diasBusca = signal(7);

  logLines = signal<string[]>([]);
  isAnalyzing = signal(false);
  analiseState = signal<'idle' | 'analyzing' | 'confirmando' | 'aplicado'>('idle');
  analiseResultados = signal<RelogioAnalise[]>([]);
  relogiosSelecionados = signal<Set<string>>(new Set());
  searchRelogios = signal('');
  isApplying = signal(false);
  diasAnalise = signal(30);
  private cancelRequested = false;

  readonly maxFuncionariosSlider = 50;

  filteredRelogios = computed(() => {
    let result = this.allRelogios();
    const countMap = this.funcionariosPorRelogio();

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
      this.relogiosSelecionados.set(new Set(relogios.map(r => r.numSerie)));
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
    inicio.setDate(inicio.getDate() - this.diasBusca());

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

  onDiasBuscaChange(dias: string) {
    const valor = parseInt(dias, 10);
    if (isNaN(valor) || valor < 1) {
      this.diasBusca.set(1);
    } else if (valor > 500) {
      this.diasBusca.set(500);
    } else {
      this.diasBusca.set(valor);
    }
    this.funcionariosPorRelogio.set(new Map());
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
    if (!search) return this.allRelogios();
    return this.allRelogios().filter(r =>
      r.descricao.toLowerCase().includes(search) ||
      r.numSerie.toLowerCase().includes(search)
    );
  });

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
