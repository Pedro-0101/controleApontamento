import { computed, inject, Injectable, signal } from '@angular/core';
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
}
