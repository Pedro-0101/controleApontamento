import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiSessionService } from '../apiSession/api-session.service';
import { Marcacao } from '../../../models/marcacao/marcacao';
import { LoggerService } from '../logger/logger.service';

export interface SelecionaMarcacoesParams {
  numSerieRelogio?: string;
  matriculaFuncionario?: string;
  dataInicio: string; // DD/MM/YYYY
  dataFim: string; // DD/MM/YYYY
  tokenAcesso: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class MarcacaoApiService {
  private http = inject(HttpClient);
  private apiSessionService = inject(ApiSessionService);
  private logger = inject(LoggerService);

  private readonly API_URL = '/api/SelecionaMarcacoes'; // Using proxy to avoid CORS

  // Observability signals
  averageResponseTime = signal<number>(0);
  apiStatus = signal<'online' | 'slow' | 'offline'>('online');
  private responseTimes: number[] = [];
  private readonly MAX_SAMPLES = 10;

  /**
   * Cenário 1: Todas as marcações da empresa no período
   */
  async getAllMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações de ${dataInicio} até ${dataFim}`);

    const params: SelecionaMarcacoesParams = {
      dataInicio,
      dataFim,
      tokenAcesso: this.apiSessionService.tokenSession()
    };

    return this.callSelecionaMarcacoes(params);
  }

  /**
   * Cenário 2: Marcações por relógio no período
   */
  async getMarcacoesByRelogio(numSerieRelogio: string, dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Getting marcacoes for clock ${numSerieRelogio}`);

    const params: SelecionaMarcacoesParams = {
      numSerieRelogio,
      dataInicio,
      dataFim,
      tokenAcesso: this.apiSessionService.tokenSession()
    };

    return this.callSelecionaMarcacoes(params);
  }

  /**
   * Cenário 3: Marcações por funcionário no período
   */
  async getMarcacoesByEmployee(matricula: string, dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Getting marcacoes for employee ${matricula}`);

    const params: SelecionaMarcacoesParams = {
      matriculaFuncionario: matricula,
      dataInicio,
      dataFim,
      tokenAcesso: this.apiSessionService.tokenSession()
    };

    return this.callSelecionaMarcacoes(params);
  }

  /**
   * Cenário 4: Marcações por funcionário e relógio no período
   */
  async getMarcacoesByEmployeeAndClock(
    matricula: string,
    numSerieRelogio: string,
    dataInicio: string,
    dataFim: string
  ): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Getting marcacoes for employee ${matricula} and clock ${numSerieRelogio}`);

    const params: SelecionaMarcacoesParams = {
      matriculaFuncionario: matricula,
      numSerieRelogio,
      dataInicio,
      dataFim,
      tokenAcesso: this.apiSessionService.tokenSession()
    };

    return this.callSelecionaMarcacoes(params);
  }

  /**
   * Chama o endpoint SelecionaMarcacoes da API externa
   */
  private async callSelecionaMarcacoes(params: SelecionaMarcacoesParams): Promise<Marcacao[]> {
    const startTime = performance.now();
    try {
      const response = await firstValueFrom(
        this.http.post<any>(this.API_URL, params, {
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const endTime = performance.now();
      this.updateObservability(endTime - startTime);

      // SOAP .NET web service returns data in 'd' property
      const data = response?.d || response;

      if (!data || !Array.isArray(data)) {
        this.logger.warn('MarcacaoApiService', 'Invalid response from SelecionaMarcacoes');
        return [];
      }

      // Transform API response to Marcacao objects
      return data.map((item: any) => this.transformToMarcacao(item));
    } catch (error) {
      this.updateObservability(3000, true); // Assume 3s timeout or error
      this.logger.error('MarcacaoApiService', 'Error calling SelecionaMarcacoes:', error);
      throw error;
    }
  }

  private updateObservability(duration: number, isError: boolean = false) {
    if (isError) {
      this.apiStatus.set('offline');
      return;
    }

    this.responseTimes.push(duration);
    if (this.responseTimes.length > this.MAX_SAMPLES) {
      this.responseTimes.shift();
    }

    const avg = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    this.averageResponseTime.set(Math.round(avg));

    if (avg < 800) {
      this.apiStatus.set('online');
    } else {
      this.apiStatus.set('slow');
    }
  }

  /**
   * Transforma o JSON da API para o modelo Marcacao
   */
  private transformToMarcacao(apiData: any): Marcacao {
    return new Marcacao({
      id: apiData.id || apiData.Id,
      atividade: apiData.Atividade || '',
      cpf: apiData.CPF || '',
      codigoUnidade: apiData.CodigoUnidade || '',
      dataInsercao: this.parseDate(apiData.DataInsercao),
      dataMarcacao: this.parseDate(apiData.DataMarcacao),
      descricaoLocal: apiData.DescricaoLocal,
      flagForaCerca: apiData.FlagForaCerca || false,
      formulario: apiData.Formulario,
      gpsLatitude: parseFloat(apiData.GPSLatitude || '0'),
      gpsLongitude: parseFloat(apiData.GPSLongitude || '0'),
      idLocal: apiData.IdLocal || 0,
      lstRespostas: apiData.LstRespostas || [],
      matriculaFuncionario: apiData.MatriculaFuncionario || '',
      nsr: apiData.NSR || 0,
      nomeLocal: apiData.NomeLocal,
      numSerieRelogio: apiData.NumSerieRelogio || '',
      pis: apiData.PIS || '',
      tipoRegistro: apiData.TipoRegistro || 0,
      trabalhadorId: apiData.TrabalhadorId || 0
    });
  }

  /**
   * Parse date from Microsoft JSON format /Date(timestamp-offset)/
   * or DD/MM/YYYY HH:mm:ss format
   */
  private parseDate(dateStr: string): Date {
    if (!dateStr) return new Date();

    try {
      // Check if it's Microsoft JSON Date format: "/Date(1234567890000-0300)/"
      if (dateStr.startsWith('/Date(')) {
        const timestamp = dateStr.match(/\d+/);
        return timestamp ? new Date(parseInt(timestamp[0], 10)) : new Date();
      }

      // Otherwise try DD/MM/YYYY HH:mm:ss format
      const [datePart, timePart] = dateStr.split(' ');
      const [day, month, year] = datePart.split('/');
      const timeStr = timePart || '00:00:00';
      const [hours, minutes, seconds] = timeStr.split(':');

      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours || '0'),
        parseInt(minutes || '0'),
        parseInt(seconds || '0')
      );
    } catch (error) {
      this.logger.error('MarcacaoApiService', 'Error parsing date:', dateStr);
      return new Date();
    }
  }

  /**
   * Format Date to DD/MM/YYYY string
   */
  formatDateToDDMMYYYY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}
