import { inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { ApiSessionService } from '../apiSession/api-session.service';
import { environment } from '../../../../environments/environment';
import { IMarcacaoJson, Marcacao } from '../../../models/marcacao/marcacao';
import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';
import { FuncionarioService } from '../funcionario/funcionario.service';

@Injectable({
  providedIn: 'root',
})

export class MarcacaoService {

  private loggerService = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);
  private funcionarioService = inject(FuncionarioService);

  private marcacoes = signal<Marcacao[]>([]);
  private marcacoesFormatadas = signal<MarcacaoDia[]>([]);
  private token = signal(this.apiSessionService.token());
  private apiUrl = environment.apiUrlListarMarcacoes;
  private isUpdating = signal(false);

  constructor() {
    this.loggerService.info('MarcacaoService', 'Componente inicializado');
  }

  getMarcacoes() {
    return this.marcacoes;
  }

  getMarcacoesFormatadas() {
    return this.marcacoesFormatadas;
  }

  getIsUpdating() {
    return this.isUpdating;
  }

  async updateMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.loggerService.info('MarcacaoService', 'Atualizando marcações');

    try {

      this.isUpdating.set(true);

      // Buscar marcações da API
      const marcacoes = await this.fetchMarcacoes(dataInicio, dataFim);

      console.log(marcacoes);

      this.marcacoes.set(marcacoes);
      this.loggerService.info('MarcacaoService', `Marcações atualizadas: ${marcacoes.length} registros encontrados`);

      // Formatar marcações por dia
      const marcacoesOrdenadas = marcacoes.sort((a, b) => a.cpf.localeCompare(b.cpf));
      const marcacoesPorDia = await this.formatarMarcacoesPorDia(marcacoesOrdenadas);
      this.marcacoesFormatadas.set(marcacoesPorDia);
      this.loggerService.info('MarcacaoService', `Marcações formatadas por dia: ${marcacoesPorDia.length} dias encontrados`);

      this.isUpdating.set(false);
      return marcacoes;

    } catch (error) {

      this.loggerService.error('MarcacaoService', 'Erro ao atualizar marcações \n' + error);
      this.marcacoes.set([]);
      this.isUpdating.set(false);
      return this.marcacoes();

    }
  }

  private async formatarMarcacoesPorDia(marcacoes: Marcacao[]): Promise<MarcacaoDia[]> {
    
    this.loggerService.info('MarcacaoService', 'Organizando marcações por dia e funcionário');

    const marcacoesDia: MarcacaoDia[] = [];

    for (const marcacao of marcacoes) {

      const nome = await this.funcionarioService.getNameByMatricula(marcacao.matriculaFuncionario);
      const dateStr = marcacao.dataMarcacao.toISOString().split('T')[0];
      const horaStr = marcacao.dataMarcacao.toISOString().split('T')[1].split('.')[0];

      const marcacaoExistente = marcacoesDia.length > 0 && 
        marcacoesDia[marcacoesDia.length - 1].cpf === marcacao.cpf &&
        marcacoesDia[marcacoesDia.length - 1].data === dateStr;

      if (marcacaoExistente) {
        marcacoesDia[marcacoesDia.length - 1].marcacoes.push(horaStr);
        continue;
      }

      const marcacaoDia = new MarcacaoDia(
        marcacao.id,
        marcacao.cpf,
        marcacao.matriculaFuncionario,
        nome,
        dateStr,
        [horaStr]
      );

      marcacoesDia.push(marcacaoDia);
    }

    return marcacoesDia;

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
