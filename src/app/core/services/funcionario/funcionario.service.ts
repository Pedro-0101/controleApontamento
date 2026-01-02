import { inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';
import { RelogioService } from '../relogio/relogio.service';
import { ApiSessionService } from '../apiSession/api-session.service';
import { Marcacao, IMarcacaoJson } from '../../../models/marcacao/marcacao';
import { Relogio } from '../../../models/relogio/relogio';

@Injectable({
  providedIn: 'root',
})
export class FuncionarioService {

  private loggerService = inject(LoggerService);
  private relogioService = inject(RelogioService);
  private apiSessionService = inject(ApiSessionService);

  private apiUrl = environment.apiUrlListarMarcacoes;
  private token = signal(this.apiSessionService.token());

  constructor() {
    this.loggerService.info("FuncionarioService", "Componente inicializado");
  }

  async getMarcacoes(): Promise<Marcacao[]> {
    this.loggerService.info("FuncionarioService", "Buscando marcações");

    try {      
      const relogios = await this.relogioService.getRelogios();
      const response = await this.getMarcacoesFromApi(relogios);

      this.loggerService.info("FuncionarioService", `Retornadas ${response.length} marcações`);
      return response;

    } catch (error) {
      this.loggerService.error("FuncionarioService", "Erro ao buscar marcações \n" + error);
      return [];
    }
  }

  private async getMarcacoesFromApi(relogios: Relogio[]): Promise<Marcacao[]> {
    let marcacoes: Marcacao[] = [];

    for (const relogio of relogios) {
      this.loggerService.info("FuncionarioService", `Buscando marcações do relógio: ${relogio.numSerie}`);
      const relogioMarcacoes = await this.getMarcacoesFromRelogio(relogio.numSerie, '01-01-2026', '31-12-2026');
      marcacoes = marcacoes.concat(relogioMarcacoes);
    }

    return marcacoes;
  }

  private async getMarcacoesFromRelogio(relogio: string, dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    const body = {
      dataInicio: dataInicio,
      dataFim: dataFim,
      numSerieRelogio: relogio,
      tokenAcesso: this.token()
    };

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