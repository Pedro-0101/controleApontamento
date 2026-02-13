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


  readonly _isLoadingMarcacoes = computed(() => this.isLoadingMarcacoes());
  readonly _marcacoes = computed(() => this.marcacoes());
  readonly _marcacoesFiltradas = computed(() => this.marcacoesFiltradas());
  readonly _relogioMarcacoes = computed(() => this.relogiosMarcacoes());
  readonly _empresasFiltroPainel = computed(() => {
    const list = this.marcacaoesFiltradasBackup();
    const empresas = list.map(m => m.empresa).filter(e => !!e);
    return [...new Set(empresas)].sort();
  });

  readonly _totalFaltas = computed(() => {
    return this.marcacaoesFiltradasBackup().filter(m => m.getStatus() === 'Falta').length;
  });

  readonly _totalPendentes = computed(() => {
    return this.marcacaoesFiltradasBackup().filter(m => m.getStatus() === 'Pendente').length;
  });

  readonly _totalIncompletos = computed(() => {
    return this.marcacaoesFiltradasBackup().filter(m => m.getStatus() === 'Incompleto').length;
  });

  readonly _totalAtrasos = computed(() => {
    return this.marcacaoesFiltradasBackup().filter(m => m.getStatus() === 'Atraso').length;
  });

  private currentDataInicio = signal<string>('');
  private currentDataFim = signal<string>('');
  private statusFiltro = signal<string[]>([]);
  private empresasFiltro = signal<string[]>([]);

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

      this.ordenarTodasMarcacoes(marcacoesPorDia);
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
    this.loggerService.info('MarcacaoService', `Formatando ${marcacoes.length} marcações brutas`);

    if (marcacoes.length === 0) {
      this.loggerService.warn('MarcacaoService', 'Nenhuma marcação recebida para formatar');
      return this.processarFuncionariosSemMarcacao([], dataInicio, dataFim);
    }

    // 1. Extrair matrículas únicas para busca em lote
    const matriculasUnicas = [...new Set(marcacoes.map(m => m.matriculaFuncionario))];

    // 2. Buscar nomes em lote (1 chamada HTTP ao invés de N)
    const employeeDataMap = new Map<string, { nome: string, empresa: string }>();
    try {
      const employeesBatch = await this.employeeService.getEmployeeNamesBatch(matriculasUnicas);
      employeesBatch.forEach(item => employeeDataMap.set(item.matricula, { nome: item.nome, empresa: item.empresa }));
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar dados dos funcionários em lote', error);
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
        const empData = employeeDataMap.get(marcacao.matriculaFuncionario);
        const nome = empData ? empData.nome : 'nome nao encontrado';
        const empresa = empData ? empData.empresa : '';

        const marcacaoDia = new MarcacaoDia(
          marcacao.id,
          marcacao.cpf,
          marcacao.matriculaFuncionario,
          nome,
          dateStr,
          [marcacao],
          empresa
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

      // Obter data solicitada (se for um único dia, usamos ela)
      const dataAlvo = dataInicio === dataFim ? dataInicio : DateHelper.getStringDate(new Date());

      // Criar um Set com as matrículas que já têm marcações
      const matriculasComMarcacao = new Set(marcacoesDia.map(m => String(m.matricula).trim()));

      // Adicionar funcionários ativos sem marcação
      for (const funcionario of funcionariosAtivos) {
        const matriculaLimpa = String(funcionario.matricula).trim();
        if (!matriculasComMarcacao.has(matriculaLimpa)) {
          // Funcionário ativo sem marcação - criar entrada com status "falta"
          const marcacaoDia = new MarcacaoDia(
            0, // ID 0 para indicar que não tem marcação real
            '', // CPF vazio (não temos na tabela de funcionários)
            matriculaLimpa,
            funcionario.nome,
            dataAlvo,
            [], // Array vazio de marcações
            funcionario.empresa
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

        const events = await this.fetchEventsBatch(
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
              console.log('Manual point added with ID:', p.id, 'for date:', dateObj);
            });
            // Re-ordenar marcações após inserção manual
            md.marcacoes.sort((a, b) => a.dataMarcacao.getTime() - b.dataMarcacao.getTime());
          }

          // Eventos (Status Fixos)
          const isoDateMd = DateHelper.toIsoDate(md.data);
          const activeEvent = events.find((e: any) =>
            e.matricula_funcionario === String(md.matricula).trim() &&
            isoDateMd >= e.data_inicio &&
            isoDateMd <= e.data_fim
          );

          if (activeEvent) {
            md.evento = activeEvent.tipo_evento;
            md.evento_categoria = activeEvent.categoria;
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
        this.http.post<{ success: boolean, message: string }>(`${environment.apiUrlBackend}/comments`, body)
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao salvar comentário:', error);
      throw error;
    }
  }

  async deletePontoManual(id: number): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    await firstValueFrom(
      this.http.delete(`${environment.apiUrlBackend}/marcacoes/manual/${id}`, {
        body: { criadoPor }
      })
    );
  }
  async updatePontoManual(id: number, novaHora: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    await firstValueFrom(
      this.http.put(`${environment.apiUrlBackend}/marcacoes/manual/${id}`, {
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
        this.http.post<{ success: boolean, message: string }>(`${environment.apiUrlBackend}/marcacoes/manual`, body)
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao salvar ponto manual:', error);
      throw error;
    }
  }

  async saveEvent(matricula: string, dataInicio: string, dataFim: string, tipoEvento: string, categoria: 'PERIODO' | 'FIXO' = 'PERIODO'): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = { matricula, dataInicio, dataFim, tipoEvento, criadoPor, categoria };

    try {
      await firstValueFrom(
        this.http.post<{ success: boolean, message: string }>(`${environment.apiUrlBackend}/employees/events`, body)
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao salvar evento:', error);
      throw error;
    }
  }

  async deleteEvent(id: number): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    try {
      await firstValueFrom(
        this.http.delete(`${environment.apiUrlBackend}/employees/events/${id}`, {
          body: { criadoPor }
        })
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao deletar evento:', error);
      throw error;
    }
  }

  private async fetchCommentsBatch(matriculas: string[], dataInicio: string, dataFim: string): Promise<any[]> {
    const body = { matriculas, dataInicio, dataFim };

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean, comments: any[] }>(`${environment.apiUrlBackend}/comments/batch`, body)
      );
      return response.success ? response.comments : [];
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar comentários:', error);
      return [];
    }
  }

  async fetchManualPointsBatch(matriculas: string[], dataInicio: string, dataFim: string): Promise<any[]> {
    const body = { matriculas, dataInicio, dataFim };

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean, points: any[] }>(`${environment.apiUrlBackend}/marcacoes/manual/batch`, body)
      );
      return response.success ? response.points : [];
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar pontos manuais:', error);
      return [];
    }
  }

  async fetchEventsBatch(matriculas: string[], dataInicio: string, dataFim: string): Promise<any[]> {
    const body = { matriculas, dataInicio, dataFim };

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean, events: any[] }>(`${environment.apiUrlBackend}/employees/events/batch`, body)
      );
      return response.success ? response.events : [];
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar eventos:', error);
      return [];
    }
  }

  private async fetchMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    // Ajuste requested pelo usuário: adicionar sempre um dia ao dataFim
    let dataFimAjustada = dataFim;
    const dateObj = DateHelper.fromStringDate(dataFim);
    if (dateObj) {
      dateObj.setDate(dateObj.getDate() + 1);
      dataFimAjustada = DateHelper.getStringDate(dateObj);
    }

    // Body exatamente conforme documentação fornecida pelo usuário
    const body = {
      dataInicio, // DD/MM/YYYY
      dataFim: dataFimAjustada, // DD/MM/YYYY (ajustada +1 dia)
      tokenAcesso: this.apiSessionService.token()
    };

    try {
      // Usando headers explícitos como no MarcacaoApiService (importante para alguns backends .NET)
      const response = await firstValueFrom(
        this.http.post<any>(this.apiUrl, body, {
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const data = response?.d || response;
      const listaBruta: IMarcacaoJson[] = Array.isArray(data) ? data : [];

      this.loggerService.info('MarcacaoService', `Found ${listaBruta.length} raw records.`);

      return listaBruta.map(item => Marcacao.fromJson(item));
    } catch (error: any) {
      this.loggerService.error('MarcacaoService', 'Erro na requisição API de marcações:', error);
      throw error;
    }
  }

  static getPossiveisStatus(): string[] {
    return ['Atraso', 'Falta', 'Incompleto', 'Ok', 'Outro', 'Pendente'];
  }

  static getPossiveisStatusFixos(): string[] {
    return ['BH', 'BH do Atraso', 'Atraso Confirmado', 'Falta Confirmada', 'Corrigido', 'Folga'];
  }

  static getPeriodEvents(): string[] {
    return ['Ferias', 'Atestado', 'Afastado', 'Suspensao'];
  }

  filtrarMarcacoesPorEmpresa(empresas: string[]): void {
    this.empresasFiltro.set(empresas);
    this.applyFilters();
  }

  filtrarMarcacoesPorStatus(status: string[]): void {
    this.statusFiltro.set(status);
    this.applyFilters();
  }

  private applyFilters(): void {
    this.isLoadingMarcacoes.set(true);
    let filtradas = this.marcacaoesFiltradasBackup();

    const empresas = this.empresasFiltro();
    if (empresas.length > 0) {
      filtradas = filtradas.filter(dia =>
        dia.empresa && empresas.includes(dia.empresa)
      );
    }

    const statuses = this.statusFiltro().map(s => s.toLowerCase());
    if (statuses.length > 0) {
      filtradas = filtradas.filter(dia => {
        const statusDia = dia.getStatus().toLowerCase();
        return statuses.includes(statusDia);
      });
    }

    this.marcacoesFiltradas.set(filtradas);
    this.isLoadingMarcacoes.set(false);
  }

  // Ordenar marcações após qualquer atualização ou inserção manual
  private ordenarTodasMarcacoes(marcacoesDia: MarcacaoDia[]): void {
    marcacoesDia.forEach(md => {
      md.marcacoes.sort((a, b) => a.dataMarcacao.getTime() - b.dataMarcacao.getTime());
    });
  }


  getRelogiosFromMarcacoes(): Relogio[] {

    return this.relogioService.getRelogiosFromMarcacoesDia(this._marcacoesFiltradas());

  }

  async getEmployeeHistory(matricula: string): Promise<any> {
    try {
      // 1. Definir período (últimos 7 dias)
      const range = DateHelper.getLastNDaysRange(7);

      // 2. Buscar marcações automáticas deste colaborador
      // Buscamos todas e filtramos para garantir consistência com a lista principal
      const allMarcacoes = await this.fetchMarcacoes(range.start, range.end);
      const automaticHistory = allMarcacoes
        .filter(m => String(m.matriculaFuncionario).trim() === String(matricula).trim())
        .map(m => ({
          ...m,
          DataMarcacao: m.dataMarcacao // Manter compatibilidade com o formato esperado pelo modal
        }));

      // 3. Buscar dados locais (pontos manuais e comentários) do backend
      const response = await firstValueFrom(
        this.http.get<{ success: boolean, history: any }>(`${environment.apiUrlBackend}/employee/${matricula}/history`)
      );

      if (response.success && response.history) {
        return {
          ...response.history,
          marcacoes: automaticHistory // Mescla com as automáticas reais
        };
      }

      // Se falhar o backend, retorna ao menos as automáticas
      return { marcacoes: automaticHistory, pontosManuais: [], comentarios: [] };

    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar histórico mesclado:', error);
      return { marcacoes: [], pontosManuais: [], comentarios: [] };
    }
  }

  async getAllEvents(): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; events: any[] }>(`${environment.apiUrlBackend}/employees/events/all`)
      );
      return response.success ? response.events : [];
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar todos os eventos:', error);
      return [];
    }
  }

  async updateEvent(id: number, dataInicio: string, dataFim: string, tipoEvento: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = { dataInicio, dataFim, tipoEvento, criadoPor };

    try {
      await firstValueFrom(
        this.http.put<{ success: boolean; message: string }>(`${environment.apiUrlBackend}/employees/events/${id}`, body)
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao atualizar evento:', error);
      throw error;
    }
  }
}
