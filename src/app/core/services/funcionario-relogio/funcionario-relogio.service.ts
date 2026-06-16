import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { ApiSessionService } from '../apiSession/api-session.service';
import { EmployeeService } from '../employee/employee.service';
import { LoggerService } from '../logger/logger.service';
import { RelogioService } from '../relogio/relogio.service';
import { FuncionarioRelogio } from '../../../models/funcionario-relogio/funcionario-relogio';
import { RelogioVinculado } from '../../../models/relogio-vinculado/relogio-vinculado';

@Injectable({ providedIn: 'root' })
export class FuncionarioRelogioService {
  private apiSessionService = inject(ApiSessionService);
  private employeeService = inject(EmployeeService);
  private loggerService = inject(LoggerService);
  private relogioService = inject(RelogioService);

  private readonly apiUrl = environment.apiUrlSelecionaFuncionarioCategoria;
  private readonly apiUrlVinculos = environment.apiUrlRelogiosPorMatricula;

  // Limite de chamadas simultâneas a RetornaRelogiosPorMatricula (1 chamada por matrícula x token)
  private static readonly CONCORRENCIA_VINCULOS = 5;

  // A API faz DateTime.Parse no parâmetro; string vazia gera erro 400.
  // Data antiga (dd/MM/yyyy) força carga completa — ver docs/api-ponto-certificado.md §3.1.
  private static readonly DATA_CARGA_COMPLETA = '01/01/2020';

  private _funcionarios = signal<FuncionarioRelogio[]>([]);
  private _loading = signal(false);

  private vinculosCache = new Map<string, RelogioVinculado[]>();
  private vinculosPendentes = new Map<string, Promise<RelogioVinculado[]>>();

  readonly funcionarios = this._funcionarios.asReadonly();
  readonly isLoading = this._loading.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const [localList, apiList] = await Promise.all([
        this.loadFromLocal(),
        this.loadFromApi()
      ]);
      this._funcionarios.set(this.merge(localList, apiList));
      this.loggerService.info('FuncionarioRelogioService', `${this._funcionarios().length} funcionários carregados`);
    } catch (error) {
      this.loggerService.error('FuncionarioRelogioService', 'Erro ao carregar funcionários: ' + error);
      this._funcionarios.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  private async loadFromLocal(): Promise<FuncionarioRelogio[]> {
    const employees = await this.employeeService.getAllEmployees();
    return employees.map(e => FuncionarioRelogio.fromEmployee(e));
  }

  private async loadFromApi(): Promise<FuncionarioRelogio[]> {
    const tokens = this.apiSessionService.getAllTokens();
    if (tokens.length === 0) {
      this.loggerService.warn('FuncionarioRelogioService', 'Nenhum token disponível para buscar funcionários');
      return [];
    }

    const results = await Promise.all(tokens.map(async token => {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataAtualizacao: FuncionarioRelogioService.DATA_CARGA_COMPLETA,
            tokenAcesso: token
          })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.d || []).map((r: any) => FuncionarioRelogio.fromApiJson(r));
      } catch {
        return [];
      }
    }));

    const seen = new Set<string>();
    return results.flat().filter(f => {
      if (!f.matricula || seen.has(f.matricula)) return false;
      seen.add(f.matricula);
      return true;
    });
  }

  merge(local: FuncionarioRelogio[], api: FuncionarioRelogio[]): FuncionarioRelogio[] {
    const map = new Map<string, FuncionarioRelogio>();
    for (const f of local) {
      if (!f.matricula) continue;
      map.set(f.matricula, f);
    }
    for (const f of api) {
      if (map.has(f.matricula)) {
        const existing = map.get(f.matricula)!;
        map.set(f.matricula, Object.assign(new FuncionarioRelogio(), existing, { fonte: 'ambos' as const }));
      } else {
        map.set(f.matricula, f);
      }
    }
    return Array.from(map.values());
  }

  /**
   * Busca os relógios vinculados a uma matrícula via RetornaRelogiosPorMatricula
   * (uma chamada por token de empresa), com cache e deduplicação por numSerie.
   * Descrição é enriquecida com o cache de relógios do RelogioService.
   */
  async getRelogiosVinculados(matricula: string): Promise<RelogioVinculado[]> {
    if (!matricula) return [];
    const cached = this.vinculosCache.get(matricula);
    if (cached) return cached;

    const pendente = this.vinculosPendentes.get(matricula);
    if (pendente) return pendente;

    const promise = this.fetchRelogiosVinculados(matricula)
      .then(vinculos => {
        this.vinculosCache.set(matricula, vinculos);
        return vinculos;
      })
      .finally(() => this.vinculosPendentes.delete(matricula));

    this.vinculosPendentes.set(matricula, promise);
    return promise;
  }

  private async fetchRelogiosVinculados(matricula: string): Promise<RelogioVinculado[]> {
    const tokens = this.apiSessionService.getAllTokens();
    if (tokens.length === 0) {
      this.loggerService.warn('FuncionarioRelogioService', 'Nenhum token disponível para buscar relógios vinculados');
      return [];
    }

    const results = await Promise.all(tokens.map(async token => {
      try {
        const response = await fetch(this.apiUrlVinculos, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matricula, tokenAcesso: token })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.d || []).map((r: any) => RelogioVinculado.fromApiJson(r));
      } catch {
        return [];
      }
    }));

    return this.dedupVinculados(results).map(v => this.enriquecerDescricao(v));
  }

  dedupVinculados(listas: RelogioVinculado[][]): RelogioVinculado[] {
    const vistos = new Set<string>();
    return listas.flat().filter(v => {
      if (!v.numSerie || vistos.has(v.numSerie)) return false;
      vistos.add(v.numSerie);
      return true;
    });
  }

  private enriquecerDescricao(vinculo: RelogioVinculado): RelogioVinculado {
    if (vinculo.descricao) return vinculo;
    const relogio = this.relogioService.getRelogioFromNumSerie(vinculo.numSerie);
    if (relogio.descricao && relogio.descricao !== 'Nao encontrado') {
      vinculo.descricao = relogio.descricao;
    }
    return vinculo;
  }

  /**
   * Preenche relogiosCadastrado/relogiosAtivo dos funcionários informados
   * (tipicamente a página visível da tabela). Limita a concorrência para
   * não sobrecarregar a API; atualiza o signal só se algo mudou.
   */
  async carregarContadores(funcionarios: FuncionarioRelogio[]): Promise<void> {
    const pendentes = funcionarios.filter(f => f.matricula && f.relogiosCadastrado === null);
    if (pendentes.length === 0) return;

    let houveMudanca = false;
    for (let i = 0; i < pendentes.length; i += FuncionarioRelogioService.CONCORRENCIA_VINCULOS) {
      const lote = pendentes.slice(i, i + FuncionarioRelogioService.CONCORRENCIA_VINCULOS);
      await Promise.all(lote.map(async f => {
        const vinculos = await this.getRelogiosVinculados(f.matricula);
        f.relogiosCadastrado = vinculos.length;
        f.relogiosAtivo = vinculos.filter(v => v.ativo).length;
        houveMudanca = true;
      }));
    }

    if (houveMudanca) {
      this._funcionarios.update(lista => [...lista]);
    }
  }
}
