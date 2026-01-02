import { inject, Injectable } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';
import { ApiSessionService } from '../apiSession/api-session.service';
import { Relogio } from '../../../models/relogio/relogio';

@Injectable({
  providedIn: 'root',
})
export class RelogioService {
  private loggerService = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);

  private apiUrl = environment.apiUrlListaRelogios;
  private token = this.apiSessionService.token();

  constructor() {
    this.loggerService.info("RelogioService", "Componente inicializado");
  }

  async getRelogios(): Promise<Relogio[]> {
    this.loggerService.info("RelogioService", "Buscando relógios");

    try {
      const response = await this.getRelogiosFromApi();
      this.loggerService.info("RelogioService", `Retornados ${response.length} relógios`);
      return response;
    } catch (error) {
      this.loggerService.error("RelogioService", "Erro ao buscar relógios \n" + error);
      return [];
    }
  }

  private async getRelogiosFromApi(): Promise<Relogio[]> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tokenAcesso: this.token })
    });

    if (!response.ok) {
      throw new Error(`Erro na requisição: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    
    const listaBruta: string[] = data.d || [];

    return listaBruta.map(serie => new Relogio({ numSerie: serie }));
  }
}