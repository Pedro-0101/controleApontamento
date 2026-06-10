import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { ApiSessionService } from '../apiSession/api-session.service';
import { EmployeeService } from '../employee/employee.service';
import { LoggerService } from '../logger/logger.service';
import { FuncionarioRelogio } from '../../../models/funcionario-relogio/funcionario-relogio';

@Injectable({ providedIn: 'root' })
export class FuncionarioRelogioService {
  private apiSessionService = inject(ApiSessionService);
  private employeeService = inject(EmployeeService);
  private loggerService = inject(LoggerService);

  private readonly apiUrl = environment.apiUrlSelecionaFuncionarioCategoria;

  private _funcionarios = signal<FuncionarioRelogio[]>([]);
  private _loading = signal(false);

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
          body: JSON.stringify({ dataAtualizacao: '', tokenAcesso: token })
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
}
