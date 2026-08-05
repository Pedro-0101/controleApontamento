import { computed, inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';
import { ApiSessionService } from '../apiSession/api-session.service';
import { EmployeeService } from '../employee/employee.service';
import { FuncionarioRelogio } from '../../../models/funcionario-relogio/funcionario-relogio';
import { RelogioVinculado } from '../../../models/relogio-vinculado/relogio-vinculado';

@Injectable({
  providedIn: 'root',
})
export class FuncionarioRelogioService {
  private logger = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);
  private employeeService = inject(EmployeeService);

  private funcionariosSignal = signal<FuncionarioRelogio[]>([]);
  readonly funcionarios = computed(() => this.funcionariosSignal());
  private isLoadingSignal = signal(false);
  readonly isLoading = computed(() => this.isLoadingSignal());

  private _vinculadosCache = new Map<string, RelogioVinculado[]>();
  private _matriculasContadas = new Set<string>();

  async load(): Promise<void> {
    this.isLoadingSignal.set(true);
    try {
      const [localFuncionarios, apiFuncionarios] = await Promise.all([
        this.getLocalFuncionarios(),
        this.getApiFuncionarios(),
      ]);
      const merged = this.merge(localFuncionarios, apiFuncionarios);
      this.enrichApiNames(merged, localFuncionarios);
      this.funcionariosSignal.set(merged);
      this.logger.info('FuncionarioRelogioService', `${merged.length} funcionários carregados (local: ${localFuncionarios.length}, api: ${apiFuncionarios.length})`);
    } catch (error) {
      this.logger.error('FuncionarioRelogioService', 'Erro ao carregar funcionários:', error);
      this.funcionariosSignal.set([]);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  private async getLocalFuncionarios(): Promise<FuncionarioRelogio[]> {
    try {
      const employees = await this.employeeService.getAllActiveEmployees();
      return employees.map(e => FuncionarioRelogio.fromEmployee(e));
    } catch {
      return [];
    }
  }

  private async getApiFuncionarios(): Promise<FuncionarioRelogio[]> {
    const tokens = this.apiSessionService.getAllTokens();
    if (tokens.length === 0) return [];

    const results = await Promise.all(tokens.map(async token => {
      try {
        const response = await fetch(environment.apiUrlSelecionaFuncionarioCategoria, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataAtualizacao: '01/01/2020', tokenAcesso: token })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.d || []).map((r: any) => FuncionarioRelogio.fromApiJson(r));
      } catch {
        return [];
      }
    }));

    const vistos = new Set<string>();
    return results.flat().filter(r => {
      if (!r.matricula || vistos.has(r.matricula)) return false;
      vistos.add(r.matricula);
      return true;
    });
  }

  merge(local: FuncionarioRelogio[], api: FuncionarioRelogio[]): FuncionarioRelogio[] {
    const map = new Map<string, FuncionarioRelogio>();

    for (const f of local) {
      f.fonte = 'local';
      map.set(f.matricula, f);
    }

    for (const f of api) {
      const existing = map.get(f.matricula);
      if (existing) {
        existing.fonte = 'ambos';
      } else {
        f.fonte = 'api';
        map.set(f.matricula, f);
      }
    }

    return Array.from(map.values());
  }

  private enrichApiNames(merged: FuncionarioRelogio[], local: FuncionarioRelogio[]): void {
    const localNameMap = new Map<string, string>();
    for (const f of local) {
      if (f.nome) localNameMap.set(f.matricula, f.nome);
    }
    for (const f of merged) {
      if (!f.nome && localNameMap.has(f.matricula)) {
        f.nome = localNameMap.get(f.matricula)!;
      }
    }
  }

  dedupVinculados(arrays: RelogioVinculado[][]): RelogioVinculado[] {
    const vistos = new Set<string>();
    const result: RelogioVinculado[] = [];
    for (const arr of arrays) {
      for (const v of arr) {
        if (!v.numSerie || vistos.has(v.numSerie)) continue;
        vistos.add(v.numSerie);
        result.push(v);
      }
    }
    return result;
  }

  async carregarContadores(funcionarios: FuncionarioRelogio[]): Promise<void> {
    const pendentes = funcionarios.filter(
      f => f.relogiosCadastrado === null && f.relogiosAtivo === null && f.matricula
    ).filter(f => !this._matriculasContadas.has(f.matricula));

    if (pendentes.length === 0) return;

    const results = await Promise.allSettled(
      pendentes.map(f => this.getRelogiosVinculados(f.matricula))
    );

    let changed = false;
    for (let i = 0; i < pendentes.length; i++) {
      const f = pendentes[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        const vinculados = result.value;
        f.relogiosCadastrado = vinculados.length;
        f.relogiosAtivo = vinculados.filter(v => v.ativo).length;
      } else {
        f.relogiosCadastrado = 0;
        f.relogiosAtivo = 0;
      }
      this._matriculasContadas.add(f.matricula);
      changed = true;
    }
    if (changed) {
      this.funcionariosSignal.update(arr => [...arr]);
    }
  }

  async getRelogiosVinculados(matricula: string): Promise<RelogioVinculado[]> {
    const cacheKey = matricula.trim();
    if (this._vinculadosCache.has(cacheKey)) {
      return this._vinculadosCache.get(cacheKey)!;
    }

    const tokens = this.apiSessionService.getAllTokens();
    const results = await Promise.all(tokens.map(async token => {
      try {
        const response = await fetch(environment.apiUrlRelogiosPorMatricula, {
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

    const vinculados = this.dedupVinculados(results);
    this._vinculadosCache.set(cacheKey, vinculados);
    return vinculados;
  }
}
