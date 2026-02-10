import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';
import { ApiSessionService } from '../apiSession/api-session.service';
import { environment } from '../../../../environments/environment';
import { IMarcacaoJson, Marcacao } from '../../../models/marcacao/marcacao';
import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';
import { ComentarioMarcacao } from '../../../models/comentarioMarcacao/comentario-marcacao';
import { FuncionarioService } from '../funcionario/funcionario.service';
import { EmployeeService } from '../employee/employee.service';
import { DateHelper } from '../../helpers/dateHelper';
import { Relogio } from '../../../models/relogio/relogio';
import { RelogioService } from '../relogio/relogio.service';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root',
})

export class MarcacaoService {

  private loggerService = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);
  private funcionarioService = inject(FuncionarioService);
  private employeeService = inject(EmployeeService);
  private relogioService = inject(RelogioService);
  private http = inject(HttpClient);
  private authService = inject(AuthService);

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

  private currentDataInicio = signal<string>('');
  private currentDataFim = signal<string>('');

  constructor() {
  }

  async updateMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.currentDataInicio.set(dataInicio);
    this.currentDataFim.set(dataFim);


    try {

      this.isLoadingMarcacoes.set(true);

      // Buscar marcações da API
      const marcacoes = await this.fetchMarcacoes(dataInicio, dataFim);

      this.marcacoes.set(marcacoes);

      // Formatar marcações por dia
      const marcacoesOrdenadas = marcacoes.sort((a, b) => a.cpf.localeCompare(b.cpf));
      const marcacoesPorDia = await this.formatarMarcacoesPorDia(marcacoesOrdenadas, dataInicio, dataFim);

      this.marcacoesFiltradas.set(marcacoesPorDia);
      this.marcacaoesFiltradasBackup.set(marcacoesPorDia);
      this.relogiosMarcacoes.set(this.getRelogiosFromMarcacoes())

      this.relogioService.updateRelogiosFromMarcacoes(marcacoesPorDia); // Atualizar os relogios das marcacoes

      this.isLoadingMarcacoes.set(false);
      return marcacoes;

    } catch (error) {

      this.loggerService.error('MarcacaoService', 'Erro ao atualizar marcações \n' + error);
      this.marcacoes.set([]);
      this.isLoadingMarcacoes.set(false);
      return this.marcacoes();

    }
  }

  async refreshMarcacoes(): Promise<void> {
    const dataInicio = this.currentDataInicio();
    const dataFim = this.currentDataFim();

    if (dataInicio && dataFim) {
      await this.updateMarcacoes(dataInicio, dataFim);
    }
  }

  private async formatarMarcacoesPorDia(marcacoes: Marcacao[], dataInicio: string, dataFim: string): Promise<MarcacaoDia[]> {

    if (marcacoes.length === 0) {
      return this.processarFuncionariosSemMarcacao([], dataInicio, dataFim);
    }

    // 1. Extrair matrículas únicas para busca em lote
    const matriculasUnicas = [...new Set(marcacoes.map(m => m.matriculaFuncionario))];

    // 2. Buscar nomes em lote (1 chamada HTTP ao invés de N)
    const nomesMap = new Map<string, string>();
    try {
      const nomesBatch = await this.employeeService.getEmployeeNamesBatch(matriculasUnicas);
      nomesBatch.forEach(item => nomesMap.set(item.matricula, item.nome));
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar nomes em lote', error);
    }

    // 3. Agrupar marcações usando Map (Lookup O(1))
    const gruposMap = new Map<string, MarcacaoDia>();

    for (const marcacao of marcacoes) {
      const dateStr = DateHelper.getStringDate(marcacao.dataMarcacao);
      const chave = `${marcacao.cpf}:${dateStr}`;

      if (gruposMap.has(chave)) {
        // Adicionar à lista existente
        gruposMap.get(chave)!.marcacoes.push(marcacao);
      } else {
        // Criar novo grupo
        const nome = nomesMap.get(marcacao.matriculaFuncionario) || 'nome nao encontrado';

        const marcacaoDia = new MarcacaoDia(
          marcacao.id,
          marcacao.cpf,
          marcacao.matriculaFuncionario,
          nome,
          dateStr,
          [marcacao]
        );
        gruposMap.set(chave, marcacaoDia);
      }
    }

    // 4. Converter para array e processar funcionários sem marcação
    const marcacoesDia = Array.from(gruposMap.values());

    return this.processarFuncionariosSemMarcacao(marcacoesDia, dataInicio, dataFim);
  }

  private async processarFuncionariosSemMarcacao(marcacoesDia: MarcacaoDia[], dataInicio: string, dataFim: string): Promise<MarcacaoDia[]> {
    // Buscar funcionários ativos e adicionar os que não têm marcações
    try {
      const funcionariosAtivos = await this.employeeService.getAllActiveEmployees();

      // Obter data de hoje para funcionários sem marcação
      const hoje = DateHelper.getStringDate(new Date());

      // Criar um Set com as matrículas que já têm marcações
      const matriculasComMarcacao = new Set(marcacoesDia.map(m => m.matricula));

      // Adicionar funcionários ativos sem marcação
      for (const funcionario of funcionariosAtivos) {
        if (!matriculasComMarcacao.has(funcionario.matricula)) {
          // Funcionário ativo sem marcação - criar entrada com status "falta"
          const marcacaoDia = new MarcacaoDia(
            0, // ID 0 para indicar que não tem marcação real
            '', // CPF vazio (não temos na tabela de funcionários)
            funcionario.matricula,
            funcionario.nome,
            hoje,
            [] // Array vazio de marcações
          );

          marcacoesDia.push(marcacaoDia)
        }
      }
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar funcionários ativos:', error);
    }

    // 4. Buscar comentários do período
    try {
      if (marcacoesDia.length > 0) {
        // Coletar matrículas dos itens processados (incluindo faltas)
        const allMatriculas = [...new Set(marcacoesDia.map(m => String(m.matricula).trim()))];

        // Converter dataInicio e dataFim para ISO para o Backend (MySQL)
        const isoInicio = DateHelper.toIsoDate(dataInicio);
        const isoFim = DateHelper.toIsoDate(dataFim);

        const comments = await this.fetchCommentsBatch(
          allMatriculas,
          isoInicio,
          isoFim
        );

        const manualPoints = await this.fetchManualPointsBatch(
          allMatriculas, isoInicio, isoFim
        );

        // Map para acesso rápido: matricula:data -> comentarios[]
        const commentsMap = new Map<string, ComentarioMarcacao[]>();
        comments.forEach((c: any) => {
          const parts = c.data.split('-');
          if (parts.length === 3) {
            const dataFormatada = `${parts[2]}/${parts[1]}/${parts[0]}`;
            const key = `${String(c.matricula_funcionario).trim()}:${dataFormatada}`;

            if (!commentsMap.has(key)) commentsMap.set(key, []);

            const comentario = new ComentarioMarcacao(
              c.comentario,
              c.criado_por || 'Sistema',
              c.criado_em
            );

            commentsMap.get(key)?.push(comentario);
          }
        });

        // Map para acesso rápido: matricula:data -> manualPoints[]
        const manualPointsMap = new Map<string, any[]>();
        manualPoints.forEach((p: any) => {
          const parts = p.data.split('-');
          if (parts.length === 3) {
            const dataFormatada = `${parts[2]}/${parts[1]}/${parts[0]}`;
            const key = `${String(p.matricula_funcionario).trim()}:${dataFormatada}`;
            if (!manualPointsMap.has(key)) manualPointsMap.set(key, []);
            manualPointsMap.get(key)?.push(p);
          }
        });

        // Anexar comentários e pontos manuais aos dias
        marcacoesDia.forEach(md => {
          const key = `${String(md.matricula).trim()}:${md.data}`;

          // Comentários (agora como array)
          if (commentsMap.has(key)) {
            md.comentarios = commentsMap.get(key);
          }

          // Pontos Manuais
          if (manualPointsMap.has(key)) {
            const points = manualPointsMap.get(key);
            points?.forEach(p => {
              const pDate = p.data.split('-');
              const pTime = p.hora.split(':');
              const dateObj = new Date(
                parseInt(pDate[0]),
                parseInt(pDate[1]) - 1,
                parseInt(pDate[2]),
                parseInt(pTime[0]),
                parseInt(pTime[1])
              );

              md.marcacoes.push(new Marcacao({
                id: p.id, // Preserve ID for delete/edit operations
                dataMarcacao: dateObj,
                numSerieRelogio: 'MANUAL',
                tipoRegistro: 99 // Tipo customizado para manual
              }));
            });
            // Re-ordenar marcações após inserção manual
            md.marcacoes.sort((a, b) => a.dataMarcacao.getTime() - b.dataMarcacao.getTime());
          }
        });
      }
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar comentários ou pontos manuais:', error);
    }

    return marcacoesDia;
  }

  // ... (processarFuncionariosSemMarcacao existing method) ...

  async saveComment(matricula: string, data: string, comentario: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = { matricula, data, comentario, criadoPor };

    try {
      await firstValueFrom(
        this.http.post<{ success: boolean, message: string }>('http://localhost:3000/api/comments', body)
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao salvar comentário:', error);
      throw error;
    }
  }

  async deletePontoManual(id: number): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    await firstValueFrom(
      this.http.delete(`http://localhost:3000/api/marcacoes/manual/${id}`, {
        body: { criadoPor }
      })
    );
  }
  async updatePontoManual(id: number, novaHora: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    await firstValueFrom(
      this.http.put(`http://localhost:3000/api/marcacoes/manual/${id}`, {
        hora: novaHora,
        criadoPor
      })
    );
  }

  async saveManualMarcacao(matricula: string, data: string, hora: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = { matricula, data, hora, criadoPor };

    try {
      await firstValueFrom(
        this.http.post<{ success: boolean, message: string }>('http://localhost:3000/api/marcacoes/manual', body)
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao salvar ponto manual:', error);
      throw error;
    }
  }

  private async fetchCommentsBatch(matriculas: string[], dataInicio: string, dataFim: string): Promise<any[]> {
    const body = { matriculas, dataInicio, dataFim };

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean, comments: any[] }>('http://localhost:3000/api/comments/batch', body)
      );
      return response.success ? response.comments : [];
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar comentários:', error);
      return [];
    }
  }

  private async fetchManualPointsBatch(matriculas: string[], dataInicio: string, dataFim: string): Promise<any[]> {
    const body = { matriculas, dataInicio, dataFim };

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean, points: any[] }>('http://localhost:3000/api/marcacoes/manual/batch', body)
      );
      return response.success ? response.points : [];
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar pontos manuais:', error);
      return [];
    }
  }

  private async fetchMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    const body = {
      dataInicio: dataInicio,
      dataFim: dataFim,
      tokenAcesso: this.token
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

  static getPossiveisStatus(): string[] {
    return ['atraso', 'corrigido', 'falta', 'ferias', 'folga', 'incompleto', 'ok', 'outro', 'pendente'];
  }

  filtrarMarcacoesPorStatus(status: string | null): void {
    this.loggerService.info('MarcacaoService', `Filtrando marcações por status: ${status}`);

    if (!status) {
      this.loggerService.error('MarcacaoService', 'Status inválido para filtragem');
      return;
    }

    if (status.toLowerCase() === 'todos') {
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
    this.relogioService.updateRelogiosFromMarcacoes(marcacoesFiltradasPorStatus);
    this.isLoadingMarcacoes.set(false);
    this.loggerService.info('MarcacaoService', `${marcacoesFiltradasPorStatus.length} marcações encontradas com status ${status}`);
    return;
  }

  filtrarMarcacoesPorRelogio(relogio: Relogio | null): void {
    if (!relogio) {
      this.marcacoesFiltradas.set(this.marcacaoesFiltradasBackup());
      this.isLoadingMarcacoes.set(false);
      return;
    }

    this.isLoadingMarcacoes.set(true);

    const listaCompleta = this.marcacaoesFiltradasBackup();
    const numSerieAlvo = this.relogioService.normalizeNumSerie(relogio.numSerie);

    const marcacoesFiltradas = listaCompleta.filter(dia => {
      return dia.marcacoes.some(m => this.relogioService.normalizeNumSerie(m.numSerieRelogio) === numSerieAlvo);
    });

    this.marcacoesFiltradas.set(marcacoesFiltradas);
    this.isLoadingMarcacoes.set(false);
  }

  getRelogiosFromMarcacoes(): Relogio[] {

    return this.relogioService.getRelogiosFromMarcacoesDia(this._marcacoesFiltradas());

  }

  async getEmployeeHistory(matricula: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean, history: any }>(`http://localhost:3000/api/employee/${matricula}/history`)
      );

      if (response.success) {
        return response.history;
      }
      return null;
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar histórico:', error);
      return null;
    }
  }
}
