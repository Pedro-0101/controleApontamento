import { computed, inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { ApiSessionService } from '../apiSession/api-session.service';
import { environment } from '../../../../environments/environment';
import { IMarcacaoJson, Marcacao } from '../../../models/marcacao/marcacao';
import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';
import { FuncionarioService } from '../funcionario/funcionario.service';
import { DateHelper } from '../../helpers/dateHelper';
import { Relogio } from '../../../models/relogio/relogio';
import { RelogioService } from '../relogio/relogio.service';

@Injectable({
  providedIn: 'root',
})

export class MarcacaoService {

  private loggerService = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);
  private funcionarioService = inject(FuncionarioService);
  private relogioService = inject(RelogioService);

  private marcacoes = signal<Marcacao[]>([]);
  private marcacoesFiltradas = signal<MarcacaoDia[]>([]);
  private marcacaoesFiltradasBackup = signal<MarcacaoDia[]>([]);
  private relogiosMarcacoes = signal<Relogio[]>([]);
  private apiUrl = environment.apiUrlListarMarcacoes;
  private isLoadingMarcacoes = signal(false);

  private readonly token = this.apiSessionService.token();
  readonly _isLoadingMarcacoes = computed(() => this.isLoadingMarcacoes());
  readonly _marcacoes = computed(() => this.marcacoes());
  readonly _marcacoesFiltradas = computed(() => this.marcacoesFiltradas());
  readonly _relogioMarcacoes = computed(() => this.relogiosMarcacoes());

  constructor() {
    this.loggerService.info('MarcacaoService', 'Componente inicializado');
  }

  async updateMarcacoes(dataInicio: Date, dataFim: Date): Promise<Marcacao[]> {
    this.loggerService.info('MarcacaoService', 'Atualizando marcações');

    try {

      this.isLoadingMarcacoes.set(true);

      const dataInicioStr = DateHelper.toStefaniniFormat(dataInicio);
      const dataFimStr = DateHelper.toStefaniniFormat(dataFim);

      this.loggerService.info('MarcacaoService', `Período de busca: ${dataInicioStr} a ${dataFimStr}`);

      // Buscar marcações da API
      const marcacoes = await this.fetchMarcacoes(dataInicioStr, dataFimStr);

      this.marcacoes.set(marcacoes);
      this.loggerService.info('MarcacaoService', `${marcacoes.length} registros encontrados`);

      // Formatar marcações por dia
      const marcacoesOrdenadas = marcacoes.sort((a, b) => a.cpf.localeCompare(b.cpf));
      const marcacoesPorDia = await this.formatarMarcacoesPorDia(marcacoesOrdenadas);

      this.marcacoesFiltradas.set(marcacoesPorDia);
      this.marcacaoesFiltradasBackup.set(marcacoesPorDia);
      this.relogiosMarcacoes.set(this.getRelogiosFromMarcacoes())
      
      this.loggerService.info('MarcacaoService', `${marcacoesPorDia.length} marcacoes formatadas`);

      this.isLoadingMarcacoes.set(false);
      return marcacoes;

    } catch (error) {

      this.loggerService.error('MarcacaoService', 'Erro ao atualizar marcações \n' + error);
      this.marcacoes.set([]);
      this.isLoadingMarcacoes.set(false);
      return this.marcacoes();

    }
  }

  private async formatarMarcacoesPorDia(marcacoes: Marcacao[]): Promise<MarcacaoDia[]> {
    
    this.loggerService.info('MarcacaoService', 'Organizando marcações por dia e funcionário');

    const marcacoesDia: MarcacaoDia[] = [];

    for (const marcacao of marcacoes) {

      const nome = await this.funcionarioService.getNameByMatricula(marcacao.matriculaFuncionario);
      const dateStr = DateHelper.getStringDate(marcacao.dataMarcacao);
      const horaStr = DateHelper.getStringTime(marcacao.dataMarcacao);

      const marcacaoExistente = marcacoesDia.length > 0 && 
        marcacoesDia[marcacoesDia.length - 1].cpf === marcacao.cpf &&
        marcacoesDia[marcacoesDia.length - 1].data === dateStr;

      if (marcacaoExistente) {
        marcacoesDia[marcacoesDia.length - 1].marcacoes.push(marcacao);
        continue;
      }

      const marcacaoDia = new MarcacaoDia(
        marcacao.id,
        marcacao.cpf,
        marcacao.matriculaFuncionario,
        nome,
        dateStr,
        [marcacao]
      );

      marcacoesDia.push(marcacaoDia);
    }

    return marcacoesDia;

  }

  private async fetchMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    const body = {
      dataInicio: dataInicio,
      dataFim: dataFim,
      tokenAcesso: this.token
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

  static getPossiveisStatus(): string[] {
    return ['atraso', 'corrigido', 'falta', 'ferias', 'folga', 'incompleto', 'ok', 'outro', 'pendente'];
  }

  filtrarMarcacoesPorStatus(status: string | null): void {
    this.loggerService.info('MarcacaoService', `Filtrando marcações por status: ${status}`);

    if (!status) {
      this.loggerService.error('MarcacaoService', 'Status inválido para filtragem');
      return;
    }

    if(status.toLowerCase() === 'todos') {
      this.marcacoesFiltradas.set(this.marcacaoesFiltradasBackup());
      this.isLoadingMarcacoes.set(false);
      return;
    }

    this.isLoadingMarcacoes.set(true);

    const marcacoesFiltradas = this.marcacaoesFiltradasBackup();
    const marcacoesFiltradasPorStatus = marcacoesFiltradas.filter(marcacaoDia => 
      marcacaoDia.getStatus() === status.toLowerCase()
    );

    this.marcacoesFiltradas.set(marcacoesFiltradasPorStatus);
    this.isLoadingMarcacoes.set(false);
    this.loggerService.info('MarcacaoService', `${marcacoesFiltradasPorStatus.length} marcações encontradas com status ${status}`);
    return;
  }

  filtrarMarcacoesPorRelogio(relogio: Relogio | null): void {
    this.loggerService.info('MarcacaoService', `Filtrando marcações por relógio: ${relogio?.descricao}`);

    // 1. Se o relógio for nulo (ou opção "Todos"), reseta a lista
    if (!relogio) {
      this.marcacoesFiltradas.set(this.marcacaoesFiltradasBackup());
      this.isLoadingMarcacoes.set(false);
      return;
    }

    this.isLoadingMarcacoes.set(true);

    const listaCompleta = this.marcacaoesFiltradasBackup();
    const numSerieAlvo = relogio.numSerie;

    // 2. Filtra os dias onde HOUVE pelo menos uma batida naquele relógio
    const marcacoesFiltradas = listaCompleta.filter(dia => {
      // O método .some() retorna true se encontrar pelo menos um item que atenda à condição
      return dia.marcacoes.some(m => m.numSerieRelogio === numSerieAlvo);
    });

    this.marcacoesFiltradas.set(marcacoesFiltradas);
    this.isLoadingMarcacoes.set(false);

    this.loggerService.info('MarcacaoService', `${marcacoesFiltradas.length} dias encontrados com registros no relógio ${relogio.descricao}`);
  }

  getRelogiosFromMarcacoes(): Relogio[] {

    return this.relogioService.getRelogiosFromMarcacoes(this._marcacoesFiltradas());

  }
}
