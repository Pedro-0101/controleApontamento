import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, catchError, of } from 'rxjs';
import { ApiSessionService } from '../apiSession/api-session.service';
import { Marcacao } from '../../../models/marcacao/marcacao';
import { LoggerService } from '../logger/logger.service';

export interface SelecionaMarcacoesParams {
  numSerieRelogio?: string;
  matriculaFuncionario?: string;
  dataInicio: string; // DD/MM/YYYY HH:MM:SS
  dataFim: string; // DD/MM/YYYY HH:MM:SS
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
   * Chama todos os tokens em paralelo e mescla os resultados.
   * Garante que dados de todas as empresas sejam retornados.
   */
  private async callAllTokens(
    baseParams: Omit<SelecionaMarcacoesParams, 'tokenAcesso'>
  ): Promise<Marcacao[]> {
    const companies = this.apiSessionService.getCompanies().filter(c => c.token);
    if (companies.length === 0) {
      this.logger.warn('MarcacaoApiService', 'Nenhum token disponível');
      return [];
    }
    const results = await Promise.all(
      companies.map(async company => {
        const marcacoes = await this.callSelecionaMarcacoes({ ...baseParams, tokenAcesso: company.token });
        marcacoes.forEach(m => m.apiEmpresaNome = company.nome);
        this.logger.info('MarcacaoApiService', `${company.nome}: ${marcacoes.length} marcação(ões) retornada(s)`);
        return marcacoes;
      })
    );
    return results.flat();
  }

  /**
   * Cenário 1: Todas as marcações de todas as empresas no período
   */
  async getAllMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações de ${dataInicio} até ${dataFim}`);
    return this.callAllTokens({
      dataInicio: `${dataInicio} 00:00:00`,
      dataFim:    `${dataFim} 23:59:59`
    });
  }

  /**
   * Cenário 2: Marcações por relógio no período (todas as empresas)
   */
  async getMarcacoesByRelogio(numSerieRelogio: string, dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações do relógio ${numSerieRelogio}`);
    return this.callAllTokens({
      numSerieRelogio,
      dataInicio: `${dataInicio} 00:00:00`,
      dataFim:    `${dataFim} 23:59:59`
    });
  }

  /**
   * Cenário 3: Marcações por funcionário no período (todas as empresas)
   */
  async getMarcacoesByEmployee(matricula: string, dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações do funcionário ${matricula}`);
    return this.callAllTokens({
      matriculaFuncionario: matricula,
      dataInicio: `${dataInicio} 00:00:00`,
      dataFim:    `${dataFim} 23:59:59`
    });
  }

  /**
   * Cenário 4: Marcações por funcionário e relógio no período (todas as empresas)
   */
  async getMarcacoesByEmployeeAndClock(
    matricula: string,
    numSerieRelogio: string,
    dataInicio: string,
    dataFim: string
  ): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações do funcionário ${matricula} no relógio ${numSerieRelogio}`);
    return this.callAllTokens({
      matriculaFuncionario: matricula,
      numSerieRelogio,
      dataInicio: `${dataInicio} 00:00:00`,
      dataFim:    `${dataFim} 23:59:59`
    });
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
          .pipe(
            catchError((error) => {
              this.logger.error('MarcacaoApiService', 'Erro na chamada SelecionaMarcacoes:', error);
              return of([]);
            })
          )
      );

      const endTime = performance.now();
      this.updateObservability(endTime - startTime);

      const data = response?.d?.results || response?.d || response;

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map((item: any) => this.transformToMarcacao(item));
    } catch (error) {
      this.updateObservability(3000, true);
      this.logger.error('MarcacaoApiService', 'Erro ao chamar SelecionaMarcacoes:', error);
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
