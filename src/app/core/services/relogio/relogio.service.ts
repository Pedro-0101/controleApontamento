import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';
import { ApiSessionService } from '../apiSession/api-session.service';
import { Relogio } from '../../../models/relogio/relogio';
import { DateHelper } from '../../helpers/dateHelper';
import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';

@Injectable({
  providedIn: 'root',
})
export class RelogioService {
  private loggerService = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);
  private http = inject(HttpClient);

  private apiUrl = environment.apiUrlListaRelogios;

  private relogios = signal<Relogio[]>([]);
  readonly _relogios = computed(() => this.relogios());

  private loadingRelogios = signal<Boolean>(true);
  readonly _loadingRelogios = computed(() => this.loadingRelogios());

  constructor() {
    this.loggerService.info('RelogioService', 'Componente inicializado');
    this.updateRelogios();
  }

  async updateRelogios(): Promise<Relogio[]> {
    this.loggerService.info('RelogioService', 'Buscando relógios na API');
    this.loadingRelogios.set(true);
    try {
      const response = await this.getRelogiosFromApi();
      this.loggerService.info('RelogioService', `Retornados ${response.length} relógios`);
      this.relogios.set(response);
      return response;
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao buscar relógios: ' + error);
      this.relogios.set([]);
      return [];
    } finally {
      this.loadingRelogios.set(false);
    }
  }

  private async getRelogiosFromApi(): Promise<Relogio[]> {
    const tokens = this.apiSessionService.getAllTokens();
    if (tokens.length === 0) {
      this.loggerService.warn('RelogioService', 'Nenhum token disponível para buscar relógios');
      return [];
    }

    const dataInicio = DateHelper.getDataInicioRequisicaoRelogio();
    const dataFim    = DateHelper.getDataFimRequisicaoRelogio();

    const results = await Promise.all(tokens.map(async token => {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datainicio: dataInicio, datafim: dataFim, status: '4', tokenAcesso: token })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.d || []).map((r: any) => Relogio.fromJson(r));
      } catch {
        return [];
      }
    }));

    // Deduplicar por numSerie normalizado
    const vistos = new Set<string>();
    return results.flat().filter(r => {
      const k = this.normalizeNumSerie(r.numSerie);
      return vistos.has(k) ? false : (vistos.add(k), true);
    });
  }

  getRelogiosFromMarcacoesDia(marcacoesDia: MarcacaoDia[]): Relogio[] {
    if (marcacoesDia.length === 0) return [];
    this.loadingRelogios.set(true);
    const numSerieSet = new Set<string>();
    marcacoesDia.forEach(m => this.getRelogiosFromMarcacao(m).forEach(ns => numSerieSet.add(ns)));
    const relogios = Array.from(numSerieSet).map(ns => this.getRelogioFromNumSerie(ns));
    this.loadingRelogios.set(false);
    return relogios;
  }

  private getRelogiosFromMarcacao(marcacao: MarcacaoDia): string[] {
    return marcacao.marcacoes.map(m => this.normalizeNumSerie(m.numSerieRelogio));
  }

  getRelogioFromNumSerie(numSerie: string): Relogio {
    const buscaLimpa = this.normalizeNumSerie(numSerie);
    const encontrado = this._relogios().find(r => this.normalizeNumSerie(r.numSerie) === buscaLimpa);
    return encontrado ?? new Relogio({
      type: 'Nao encontrado', id: 'Nao encontrado', dataCriacao: 'Nao encontrado',
      descricao: 'Nao encontrado', numSerie: 'Nao encontrado', status: 0,
    });
  }

  public normalizeNumSerie(numSerie: string | undefined | null): string {
    if (!numSerie) return '';
    return numSerie.replace(/\./g, '').replace(/^0+/, '');
  }

  async resyncRelogios(numSeries: string[]): Promise<{ success: boolean; totalAdicionados: number; totalRemovidos: number; erros: string[]; message: string }> {
    try {
      const tokens = this.apiSessionService.getAllTokens();
      const resp = await firstValueFrom(
        this.http.post<{ success: boolean; totalAdicionados: number; totalRemovidos: number; erros: string[]; message: string }>(
          '/api/relogios/resync',
          { numSeries, tokens }
        )
      );
      return resp;
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao resincronizar relógios: ' + error);
      return { success: false, totalAdicionados: 0, totalRemovidos: 0, erros: [], message: 'Erro de comunicação com o servidor' };
    }
  }

  async gerenciarFuncionariosDoRelogio(numSerie: string, matriculas: string[]): Promise<{ success: boolean; adicionados: number; removidos: number; apiVinculado: boolean; apiMessage: string }> {
    try {
      const tokens = this.apiSessionService.getAllTokens();
      const resp = await firstValueFrom(
        this.http.post<{ success: boolean; adicionados: number; removidos: number; apiVinculado: boolean; apiMessage: string }>(
          `/api/relogios/${encodeURIComponent(numSerie)}/funcionarios/gerenciar`,
          { matriculas, tokens }
        )
      );
      return resp;
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao gerenciar funcionários do relógio: ' + error);
      return { success: false, adicionados: 0, removidos: 0, apiVinculado: false, apiMessage: 'Erro de comunicação com o servidor' };
    }
  }

  async getFuncionariosCountFromDB(numSeries?: string[]): Promise<Map<string, number>> {
    try {
      let url = '/api/relogios/funcionarios-count';
      if (numSeries && numSeries.length > 0) {
        url += '?num_series=' + numSeries.map(ns => encodeURIComponent(ns)).join(',');
      }
      const resp = await firstValueFrom(this.http.get<{ success: boolean; counts: Record<string, number> }>(url));
      if (!resp.success) return new Map();
      const map = new Map<string, number>();
      for (const [key, value] of Object.entries(resp.counts)) {
        map.set(key, value);
      }
      return map;
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao buscar contagem de funcionários: ' + error);
      return new Map();
    }
  }

  async previewResyncRelogios(numSeries: string[]): Promise<{ success: boolean; totalAdicionados: number; totalRemovidos: number; erros: string[]; porRelogio: { num_serie: string; aAdicionar: { matricula: string; nome: string }[]; aRemover: { matricula: string; nome: string }[] }[]; message: string }> {
    try {
      const tokens = this.apiSessionService.getAllTokens();
      const resp = await firstValueFrom(
        this.http.post<{ success: boolean; totalAdicionados: number; totalRemovidos: number; erros: string[]; porRelogio: { num_serie: string; aAdicionar: { matricula: string; nome: string }[]; aRemover: { matricula: string; nome: string }[] }[]; message: string }>(
          '/api/relogios/resync/preview',
          { numSeries, tokens }
        )
      );
      return resp;
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao gerar prévia de resync: ' + error);
      return { success: false, totalAdicionados: 0, totalRemovidos: 0, erros: [], porRelogio: [], message: 'Erro de comunicação com o servidor' };
    }
  }

  async toggleAtivo(numSerie: string, ativo: boolean): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ success: boolean; message: string }>('/api/relogios/toggle-ativo', { num_serie: numSerie, ativo })
      );
      return resp.success;
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao alterar status do relógio: ' + error);
      return false;
    }
  }

  async toggleAtivoBulk(numSeries: string[], ativo: boolean): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ success: boolean; atualizados: number; message: string }>('/api/relogios/toggle-ativo-bulk', { num_series: numSeries, ativo })
      );
      return resp.success;
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao alterar status em lote: ' + error);
      return false;
    }
  }

  async fetchLocalStatus(): Promise<Record<string, boolean>> {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ success: boolean; status: Record<string, boolean> }>('/api/relogios/local-status')
      );
      if (!resp.success) return {};
      return resp.status;
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao buscar status local: ' + error);
      return {};
    }
  }

  async getFuncionariosByRelogio(numSerie: string): Promise<any[]> {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ success: boolean; funcionarios: any[] }>(`/api/relogios/${encodeURIComponent(numSerie)}/funcionarios`)
      );
      return resp.success ? resp.funcionarios : [];
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao buscar funcionários do relógio: ' + error);
      return [];
    }
  }

  async removerFuncionarioDoRelogio(numSerie: string, matricula: string): Promise<{ success: boolean; apiVinculado: boolean; apiMessage: string }> {
    try {
      const tokens = this.apiSessionService.getAllTokens();
      const resp = await firstValueFrom(
        this.http.post<{ success: boolean; message: string; apiVinculado: boolean; apiMessage: string }>(
          `/api/relogios/${encodeURIComponent(numSerie)}/funcionarios/remover`,
          { matricula, tokens }
        )
      );
      if (resp.apiVinculado) {
        this.loggerService.info('RelogioService', `Desvinculação API OK — matrícula ${matricula} removida do relógio ${numSerie}`);
      } else {
        this.loggerService.warn('RelogioService', `Desvinculação API falhou — matrícula ${matricula} do relógio ${numSerie}: ${resp.apiMessage}`);
      }
      return { success: resp.success, apiVinculado: resp.apiVinculado ?? false, apiMessage: resp.apiMessage ?? '' };
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao remover funcionário do relógio: ' + error);
      return { success: false, apiVinculado: false, apiMessage: 'Erro de comunicação com o servidor' };
    }
  }

  async adicionarFuncionarioAoRelogio(numSerie: string, matricula: string): Promise<{ success: boolean; apiVinculado: boolean; apiMessage: string }> {
    try {
      const tokens = this.apiSessionService.getAllTokens();
      const resp = await firstValueFrom(
        this.http.post<{ success: boolean; message: string; apiVinculado: boolean; apiMessage: string }>(
          `/api/relogios/${encodeURIComponent(numSerie)}/funcionarios/adicionar`,
          { matricula, tokens }
        )
      );
      if (resp.apiVinculado) {
        this.loggerService.info('RelogioService', `Vinculação API OK — matrícula ${matricula} adicionada ao relógio ${numSerie}`);
      } else {
        this.loggerService.warn('RelogioService', `Vinculação API falhou — matrícula ${matricula} ao relógio ${numSerie}: ${resp.apiMessage}`);
      }
      return { success: resp.success, apiVinculado: resp.apiVinculado ?? false, apiMessage: resp.apiMessage ?? '' };
    } catch (error) {
      this.loggerService.error('RelogioService', 'Erro ao adicionar funcionário ao relógio: ' + error);
      return { success: false, apiVinculado: false, apiMessage: 'Erro de comunicação com o servidor' };
    }
  }

  async mergeLocalStatus(relogios: Relogio[]): Promise<Relogio[]> {
    try {
      const statusMap = await this.fetchLocalStatus();
      for (const r of relogios) {
        const key = this.normalizeNumSerie(r.numSerie);
        if (key in statusMap) {
          r.ativo = statusMap[key];
        }
      }
    } catch {
      // mantém ativo=true (default) se falhar
    }
    return relogios;
  }
}
