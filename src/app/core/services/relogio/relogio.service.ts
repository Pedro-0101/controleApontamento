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

  private relogios = signal<Relogio[]>([]);
  readonly _relogios = computed(() => this.relogios());

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

  getRelogiosFromMarcacoes(marcacoesDia: MarcacaoDia[]): Relogio[] {
    this.loggerService.info("RelogioService", "Buscando informacoes de relogios das marcacoes");
    this.loadingRelogios.set(true);

    let numSerieRelogios: string[] = [];

    if (marcacoesDia.length === 0) {
      return [];
    }

    marcacoesDia.map(marcacaoDia => {
      marcacaoDia.marcacoes.map(m => {
        numSerieRelogios.push(m.numSerieRelogio)
      })
    })

    const numSerieRelogiosUnicos = [... new Set(numSerieRelogios)];

    this.loadingRelogios.set(false);

    return numSerieRelogiosUnicos.map(r => this.getRelogioFromNumSerie(r));

  }

  private getRelogioFromNumSerie(numSerie: string): Relogio {

    let listaRelogios = this._relogios();
    const relogioEncontrado = listaRelogios.find(r => r.numSerie === numSerie);

    if (!relogioEncontrado) {
      return new Relogio({
        type: 'Nao encontrado',
        id: 0,
        dataCriacao: 'Nao encontrado',
        descricao: 'Nao encontrado',
        numSerie: 'Nao encontrado',
        status: 0,
      })
    }

    return relogioEncontrado;

  }

  getRelogioFromId(id: number): Relogio {
    let listaRelogios = this._relogios();
    const relogioEncontrado = listaRelogios.find(r => r.id === id);

    if (!relogioEncontrado) {
      return new Relogio({
        type: 'Nao encontrado',
        id: 0,
        dataCriacao: 'Nao encontrado',
        descricao: 'Nao encontrado',
        numSerie: 'Nao encontrado',
        status: 0,
      })
    }

    return relogioEncontrado;
  }

}