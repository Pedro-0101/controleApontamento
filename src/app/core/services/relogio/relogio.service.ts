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
  private readonly token = this.apiSessionService.token();

  // Todos os relogios da empresa
  private relogios = signal<Relogio[]>([]);
  readonly _relogios = computed(() => this.relogios());

  // Todos os relogios das marcacoes filtradas
  private relogiosMarcacoes = signal<Relogio[]>([]);
  readonly _relogiosMarcacoes = computed(() => this.relogiosMarcacoes());

  private loadingRelogios = signal<Boolean>(true);
  readonly _loadingRelogios = computed(() => this.loadingRelogios());

  constructor() {
    this.loggerService.info("RelogioService", "Componente inicializado");

    this.updateRelogios();
  }

  async updateRelogios(): Promise<Relogio[]> { // Renomeei para updateRelogios para manter padrão
    this.loggerService.info("RelogioService", "Buscando relógios na API");
    this.loadingRelogios.set(true);

    try {
      const response = await this.getRelogiosFromApi();
      
      this.loggerService.info("RelogioService", `Retornados ${response.length} relógios`);
  
      this.relogios.set(response); 
      
      return response;

    } catch (error) {
      this.loggerService.error("RelogioService", "Erro ao buscar relógios \n" + error);
      this.relogios.set([]);
      return [];

    } finally {
      this.loadingRelogios.set(false);
    }
  }

  private async getRelogiosFromApi(): Promise<Relogio[]> {

    this.loggerService.info("RelogioService", "Buscando relogios na api");

    const dataInicio = DateHelper.getDataInicioRequisicaoRelogio();
    const dataFim = DateHelper.getDataFimRequisicaoRelogio();

    const body = {
      datainicio: dataInicio,
      datafim: dataFim,
      status: '4',
      tokenAcesso: this.token
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Erro na requisição: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    const listaBruta: any[] = data.d || [];

    return listaBruta.map(r => Relogio.fromJson(r));
  }

  updateRelogiosFromMarcacoes(marcacoesDia: MarcacaoDia[]): void {
    const relogios = this.getRelogiosFromMarcacoesDia(marcacoesDia);

    this.relogiosMarcacoes.set(relogios);
  }

  getRelogiosFromMarcacoesDia(marcacoesDia: MarcacaoDia[]): Relogio[] {
    this.loggerService.info("RelogioService", "Buscando informacoes de relogios das marcacoes");
    
    if (marcacoesDia.length === 0) {
      return [];
    }

    this.loadingRelogios.set(true);

    const numSerieSet = new Set<string>();
    
    marcacoesDia.forEach(m => {
      this.getRelogiosFromMarcacao(m).forEach(numSerie => numSerieSet.add(numSerie));
    });

    const relogios = Array.from(numSerieSet).map(numSerie => 
      this.getRelogioFromNumSerie(numSerie)
    );

    this.loadingRelogios.set(false);

    return relogios;
  }

  private getRelogiosFromMarcacao(marcacao: MarcacaoDia): string[] {
    return marcacao.marcacoes.map(m => this.normalizeNumSerie(m.numSerieRelogio));
  }

  getRelogioFromNumSerie(numSerie: string): Relogio {
    const relogios = this._relogios();
    const buscaLimpa = this.normalizeNumSerie(numSerie);
    
    const relogioEncontrado = relogios.find(r => 
        this.normalizeNumSerie(r.numSerie) === buscaLimpa
    );

    if (!relogioEncontrado) {
      return new Relogio({
        type: 'Nao encontrado',
        id: 'Nao encontrado',
        dataCriacao: 'Nao encontrado',
        descricao: 'Nao encontrado',
        numSerie: 'Nao encontrado',
        status: 0,
      });
    }

    return relogioEncontrado;
  }

  private normalizeNumSerie(numSerie: string | undefined | null): string {
    if (!numSerie) return '';
    return numSerie.replace(/\./g, '').replace(/^0+/, '');
  }

}