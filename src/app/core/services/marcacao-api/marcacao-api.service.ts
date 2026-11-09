import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Marcacao } from '../../../models/marcacao/marcacao';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';

interface MarcacaoLocalDto {
  id: number | null;
  marcacao_id: number | null;
  matricula: string;
  cpf: string;
  pis: string;
  data_marcacao: string;
  data_insercao: string | null;
  nsr: number | null;
  num_serie_relogio: string;
  tipo_registro: number | null;
  id_local: number | null;
  nome_local: string | null;
  descricao_local: string | null;
  codigo_unidade: string;
  gps_latitude: string;
  gps_longitude: string;
  flag_fora_cerca: boolean;
  atividade: string;
  trabalhador_id: number | null;
  provedor: string;
}

interface MarcacaoPeriodoResponse {
  success: boolean;
  total: number;
  porOrigem: Record<string, number>;
  marcacoes: MarcacaoLocalDto[];
}

/**
 * Cliente único das marcações de ponto.
 *
 * A leitura é feita na base local (`marcacoes_ponto`), que recebe os pontos de
 * todas as integrações. Assim o painel e os relatórios mostram todos os pontos
 * de todos os funcionários, independentemente da origem, sem precisar
 * configurar ou selecionar API/empresa/provedor no frontend.
 */
@Injectable({
  providedIn: 'root'
})
export class MarcacaoApiService {
  private http = inject(HttpClient);
  private logger = inject(LoggerService);

  private readonly API_URL = `${environment.apiUrlBackend}/marcacoes/periodo`;

  // Observability signals (mantidos para o indicador da sidebar)
  averageResponseTime = signal<number>(0);
  apiStatus = signal<'online' | 'slow' | 'offline'>('online');
  private responseTimes: number[] = [];
  private readonly MAX_SAMPLES = 10;

  /**
   * Cenário 1: todas as marcações de todos os funcionários no período.
   */
  async getAllMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações locais de ${dataInicio} até ${dataFim}`);
    return this.fetch({ dataInicio, dataFim });
  }

  /**
   * Cenário 2: marcações por relógio no período.
   */
  async getMarcacoesByRelogio(numSerieRelogio: string, dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações locais do relógio ${numSerieRelogio}`);
    return this.fetch({ numSerieRelogio, dataInicio, dataFim });
  }

  /**
   * Cenário 3: marcações por funcionário no período.
   */
  async getMarcacoesByEmployee(matricula: string, dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações locais do funcionário ${matricula}`);
    return this.fetch({ matriculaFuncionario: matricula, dataInicio, dataFim });
  }

  /**
   * Cenário 4: marcações por funcionário e relógio no período.
   */
  async getMarcacoesByEmployeeAndClock(
    matricula: string,
    numSerieRelogio: string,
    dataInicio: string,
    dataFim: string
  ): Promise<Marcacao[]> {
    this.logger.info('MarcacaoApiService', `Buscando marcações locais do funcionário ${matricula} no relógio ${numSerieRelogio}`);
    return this.fetch({ matriculaFuncionario: matricula, numSerieRelogio, dataInicio, dataFim });
  }

  private async fetch(filtros: Record<string, string>): Promise<Marcacao[]> {
    const startTime = performance.now();

    try {
      const response = await firstValueFrom(
        this.http.post<MarcacaoPeriodoResponse>(this.API_URL, filtros)
      );

      const endTime = performance.now();
      this.updateObservability(endTime - startTime);

      const rows = response?.marcacoes || [];
      const porOrigem = response?.porOrigem || {};
      const resumo = Object.entries(porOrigem)
        .map(([origem, total]) => `${this.rotuloOrigem(origem)}=${total}`)
        .join(', ');

      this.logger.info(
        'MarcacaoApiService',
        `[Origem dos pontos] ${filtros['dataInicio']} a ${filtros['dataFim']}: ` +
        `total=${rows.length}${resumo ? ` | ${resumo}` : ''}`
      );
      return rows.map(row => this.transformToMarcacao(row));
    } catch (error) {
      this.updateObservability(3000, true);
      this.logger.error('MarcacaoApiService', 'Erro ao consultar marcações locais:', error);
      throw error;
    }
  }

  private transformToMarcacao(row: MarcacaoLocalDto): Marcacao {
    return new Marcacao({
      id: row.marcacao_id ?? row.id ?? 0,
      atividade: row.atividade || '',
      cpf: row.cpf || '',
      codigoUnidade: row.codigo_unidade || '',
      dataInsercao: this.parseDate(row.data_insercao) || undefined,
      dataMarcacao: this.parseDate(row.data_marcacao) || new Date(),
      descricaoLocal: row.descricao_local,
      flagForaCerca: !!row.flag_fora_cerca,
      formulario: null,
      gpsLatitude: parseFloat(row.gps_latitude || '0'),
      gpsLongitude: parseFloat(row.gps_longitude || '0'),
      idLocal: row.id_local || 0,
      lstRespostas: [],
      matriculaFuncionario: row.matricula || '',
      nsr: row.nsr || 0,
      nomeLocal: row.nome_local,
      numSerieRelogio: row.num_serie_relogio || '',
      pis: row.pis || '',
      tipoRegistro: row.tipo_registro || 0,
      trabalhadorId: row.trabalhador_id || 0,
      provedor: row.provedor || ''
    });
  }

  private rotuloOrigem(origem: string): string {
    if (origem === 'exata') return 'ExataWeb';
    if (origem === 'pontocertificado') return 'Stefanini/Ponto Certificado';
    return origem || 'Desconhecida';
  }

  private parseDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const raw = String(value).trim();
    if (!raw) return null;

    // Datas ISO (inclui o fuso de Brasília) enviadas pelo backend.
    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime())) return iso;

    // Fallback: DD/MM/AAAA HH:mm:ss
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return null;

    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
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

  formatDateToDDMMYYYY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}
