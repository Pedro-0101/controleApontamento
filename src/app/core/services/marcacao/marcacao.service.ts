import { inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { ApiSessionService } from '../apiSession/api-session.service';
import { environment } from '../../../../environments/environment';
import { IMarcacaoJson, Marcacao } from '../../../models/marcacao/marcacao';

@Injectable({
  providedIn: 'root',
})

export class MarcacaoService {

  private loggerService = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);

  private marcacoes = signal<Marcacao[]>([]);
  private token = signal(this.apiSessionService.token());
  private apiUrl = environment.apiUrlListarMarcacoes;
  private isUpdating = signal(false);

  constructor() {
    this.loggerService.info('MarcacaoService', 'Componente inicializado');
  }

  async updateMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.loggerService.info('MarcacaoService', 'Atualizando marcações');

    try {

      this.isUpdating.set(true);

      const marcacoes = await this.fetchMarcacoes(dataInicio, dataFim);

      this.marcacoes.set(marcacoes);
      this.loggerService.info('MarcacaoService', `Marcações atualizadas: ${marcacoes.length} registros encontrados`);
      this.isUpdating.set(false);
      return marcacoes;

    } catch (error) {

      this.loggerService.error('MarcacaoService', 'Erro ao atualizar marcações \n' + error);
      this.marcacoes.set([]);
      this.isUpdating.set(false);
      return this.marcacoes();

    }
  }

  getMarcacoes() {
    return this.marcacoes;
  }

  private async fetchMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    const body = {
      dataInicio: dataInicio,
      dataFim: dataFim,
      tokenAcesso: this.token()
    };

    this.loggerService.info('MarcacaoService', 'Buscando marcações na API');
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
    const listaBruta: IMarcacaoJson[] = data.d || [];

    return listaBruta.map(item => Marcacao.fromJson(item));
  }
}
