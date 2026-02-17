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
import { MarcacaoApiService } from '../marcacao-api/marcacao-api.service';

@Injectable({
  providedIn: 'root',
})

export class MarcacaoService {

  private loggerService = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);
  private funcionarioService = inject(FuncionarioService);
  private employeeService = inject(EmployeeService);
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private marcacaoApiService = inject(MarcacaoApiService);

  private marcacoes = signal<Marcacao[]>([]);
  private marcacoesFiltradas = signal<MarcacaoDia[]>([]);
  private marcacaoesFiltradasBackup = signal<MarcacaoDia[]>([]);
  private isLoadingMarcacoes = signal(false);


  readonly _isLoadingMarcacoes = computed(() => this.isLoadingMarcacoes());
  readonly _marcacoes = computed(() => this.marcacoes());
  readonly _marcacoesFiltradas = computed(() => this.marcacoesFiltradas());
  readonly _empresasFiltroPainel = computed(() => {
    const backup = this.marcacaoesFiltradasBackup();
    const selecionadosStatus = this.statusFiltro().map(s => s.toLowerCase());

    // 1. Identificar todas as empresas únicas no backup
    const empresasUnicas = [...new Set(backup.map(m => m.empresa).filter(e => !!e))].sort();

    // 2. Calcular contagens para cada empresa considerando APENAS o filtro de STATUS
    // (Ignoramos o filtro de empresas aqui para que a lista de opções não suma ao selecionar uma)
    return empresasUnicas.map(empresa => {
      const count = backup.filter(m => {
        const matchesEmpresa = m.empresa === empresa;
        const matchesStatus = selecionadosStatus.length === 0 || selecionadosStatus.includes((m.getStatus() || '').toLowerCase());
        return matchesEmpresa && matchesStatus;
      }).length;

      return {
        label: `${empresa} (${count})`,
        value: empresa
      };
    });
  });

  readonly _statusFiltroComContagem = computed(() => {
    const backup = this.marcacaoesFiltradasBackup();
    const selecionadosEmpresas = this.empresasFiltro();

    // 1. Identificar todos os status possíveis no backup (filtrados por empresa)
    // Para contagem de status, respeitamos apenas o filtro de empresas
    const counts = new Map<string, number>();

    backup.forEach(m => {
      const matchesEmpresa = selecionadosEmpresas.length === 0 || (m.empresa && selecionadosEmpresas.includes(m.empresa));
      if (matchesEmpresa) {
        const status = m.getStatus();
        counts.set(status, (counts.get(status) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .map(([status, count]) => ({
        label: `${status} (${count})`,
        value: status
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  });

  readonly _totalFaltas = computed(() => {
    return this.marcacaoesFiltradasBackup().filter(m => m.getStatus() === 'Falta').length;
  });

  readonly _totalPendentes = computed(() => {
    return this.marcacaoesFiltradasBackup().filter(m => m.getStatus() === 'Corrigido').length;
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
      this.marcacaoesFiltradasBackup.set(marcacoesPorDia);

      // Aplicar filtros existentes ao invés de resetar para a lista completa
      this.applyFilters();

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

  async formatarMarcacoesPorDia(marcacoes: Marcacao[], dataInicio: string, dataFim: string, matriculasAlvo?: string[]): Promise<MarcacaoDia[]> {
    this.loggerService.info('MarcacaoService', `Formatando ${marcacoes.length} marcações brutas`);

    if (marcacoes.length === 0) {
      this.loggerService.warn('MarcacaoService', 'Nenhuma marcação recebida para formatar');
      return this.processarFuncionariosSemMarcacao([], dataInicio, dataFim, matriculasAlvo);
    }

    // 1. Extrair matrículas únicas para busca em lote
    const matriculasUnicas = [...new Set(marcacoes.map(m => m.matriculaFuncionario))];

    // 2. Buscar nomes em lote (1 chamada HTTP ao invés de N)
    const employeeDataMap = new Map<string, { nome: string, empresa: string, trabalha_sabado: number }>();
    try {
      const employeesBatch = await this.employeeService.getEmployeeNamesBatch(matriculasUnicas);
      employeesBatch.forEach(item => employeeDataMap.set(item.matricula, {
        nome: item.nome,
        empresa: item.empresa,
        trabalha_sabado: item.trabalha_sabado
      }));
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar dados dos funcionários em lote', error);
    }

    // 3. Agrupar marcações usando Map (Lookup O(1))
    const gruposMap = new Map<string, MarcacaoDia>();

    for (const marcacao of marcacoes) {
      // Lógica de Dia Lógico: Batidas antes das 05:00 pertencem à jornada do dia anterior
      const dataHora = new Date(marcacao.dataMarcacao);
      const logicalDate = new Date(dataHora);
      if (dataHora.getHours() < 5) {
        logicalDate.setDate(logicalDate.getDate() - 1);
      }

      const dateStr = DateHelper.getStringDate(logicalDate);
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
          empresa,
          empData ? (empData.trabalha_sabado === 1) : true
        );
        gruposMap.set(chave, marcacaoDia);
      }
    }

    // 4. Converter para array e processar funcionários sem marcação
    const marcacoesDia = Array.from(gruposMap.values());

    return this.processarFuncionariosSemMarcacao(marcacoesDia, dataInicio, dataFim, matriculasAlvo);
  }

  private async processarFuncionariosSemMarcacao(marcacoesDia: MarcacaoDia[], dataInicio: string, dataFim: string, matriculasAlvo?: string[]): Promise<MarcacaoDia[]> {
    let funcionariosAtivos: any[] = [];
    // Buscar funcionários ativos
    try {
      if (matriculasAlvo && matriculasAlvo.length > 0) {
        // Se tiver alvos específicos, buscamos apenas os nomes/empresas deles (optimizado)
        funcionariosAtivos = await this.employeeService.getEmployeeNamesBatch(matriculasAlvo);
      } else {
        funcionariosAtivos = await this.employeeService.getAllActiveEmployees();
      }

      // Gerar lista de datas no intervalo
      const dates: string[] = [];
      const currentDate = DateHelper.fromStringDate(dataInicio);
      const endDate = DateHelper.fromStringDate(dataFim);

      if (currentDate && endDate) {
        while (currentDate <= endDate) {
          dates.push(DateHelper.getStringDate(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        // Fallback se datas invalidas
        dates.push(dataInicio);
      }

      // Criar um Map para acesso rápido por matrícula:data
      const marcacoesMap = new Set(marcacoesDia.map(m => `${String(m.matricula).trim()}:${m.data}`));

      // Iterar por cada data e cada funcionário ativo
      for (const dateStr of dates) {
        for (const funcionario of funcionariosAtivos) {
          const matriculaLimpa = String(funcionario.matricula).trim();
          const key = `${matriculaLimpa}:${dateStr}`;

          if (!marcacoesMap.has(key)) {
            const marcacaoDia = new MarcacaoDia(
              0,
              '',
              matriculaLimpa,
              funcionario.nome,
              dateStr,
              [],
              funcionario.empresa,
              funcionario.trabalha_sabado === 1
            );
            marcacoesDia.push(marcacaoDia);
            marcacoesMap.add(key);
          }
        }
      }

    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao processar funcionários sem marcação:', error);
    }

    // 4. Buscar comentários e pontos locais do período
    try {
      if (marcacoesDia.length >= 0) { // Permitir buscar mesmo se não houver marcações da API
        // Coletar todas as matrículas ativas ou com marcação
        const allMatriculas = [...new Set(marcacoesDia.map(m => String(m.matricula).trim()))];

        // Se a lista estiver vazia (caso raro onde não há funcionários no banco), nada a fazer
        if (allMatriculas.length === 0) return marcacoesDia;

        // Converter datas para ISO para o Backend
        const isoInicio = DateHelper.toIsoDate(dataInicio);
        const isoFim = DateHelper.toIsoDate(dataFim);

        // Ajuste: Buscar manual points até o dia seguinte para capturar batidas < 05:00
        const dataFimObj = DateHelper.fromStringDate(dataFim);
        if (dataFimObj) dataFimObj.setDate(dataFimObj.getDate() + 1);
        const isoFimAjustado = dataFimObj ? DateHelper.toIsoDate(DateHelper.getStringDate(dataFimObj)) : isoFim;

        const [comments, manualPoints, events, ignoredPoints] = await Promise.all([
          this.fetchCommentsBatch(allMatriculas, isoInicio, isoFim),
          this.fetchManualPointsBatch(allMatriculas, isoInicio, isoFimAjustado),
          this.fetchEventsBatch(allMatriculas, isoInicio, isoFim),
          this.fetchIgnoredPointsBatch(allMatriculas, isoInicio, isoFimAjustado)
        ]);

        // Map para acesso rápido: matricula:data -> ignoredPointsSet
        const ignoredPointsMap = new Map<string, Set<string>>();
        ignoredPoints.forEach((p: any) => {
          const parts = p.data.split('-');
          const dataFormatada = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : p.data;
          const key = `${String(p.matricula_funcionario).trim()}:${dataFormatada}`;
          if (!ignoredPointsMap.has(key)) ignoredPointsMap.set(key, new Set());

          if (p.marcacao_id) {
            ignoredPointsMap.get(key)?.add(`manual:${p.marcacao_id}`);
          } else {
            const nsr = p.nsr !== null && p.nsr !== undefined ? p.nsr : '';
            const relogio_ns = p.relogio_ns !== null && p.relogio_ns !== undefined ? p.relogio_ns : '';
            ignoredPointsMap.get(key)?.add(`auto:${nsr}:${relogio_ns}`);
          }
        });

        // Map para acesso rápido: matricula:data -> comentarios[]
        const commentsMap = new Map<string, ComentarioMarcacao[]>();
        comments.forEach((c: any) => {
          const parts = c.data.split('-');
          if (parts.length === 3) {
            const dataFormatada = `${parts[2]}/${parts[1]}/${parts[0]}`;
            const key = `${String(c.matricula_funcionario).trim()}:${dataFormatada}`;
            if (!commentsMap.has(key)) commentsMap.set(key, []);
            commentsMap.get(key)?.push(new ComentarioMarcacao(c.comentario, c.criado_por || 'Sistema', c.criado_em));
          }
        });

        // Map para acesso rápido: matricula:data -> manualPoints[]
        // AQUI APLICAMOS A LÓGICA DO DIA LÓGICO PARA PONTOS MANUAIS
        const manualPointsMap = new Map<string, any[]>();
        manualPoints.forEach((p: any) => {
          const parts = p.data.split('-');
          if (parts.length === 3) {
            const [year, month, day] = parts.map(Number);
            const [hour, min] = p.hora.split(':').map(Number);

            const dateObj = new Date(year, month - 1, day, hour, min);
            const logicalDate = new Date(dateObj);

            // Lógica de Dia Lógico: Batidas antes das 05:00 pertencem ao dia anterior
            if (hour < 5) {
              logicalDate.setDate(logicalDate.getDate() - 1);
            }

            const dataFormatada = DateHelper.getStringDate(logicalDate);
            const key = `${String(p.matricula_funcionario).trim()}:${dataFormatada}`;

            // Verificar se a data lógica está dentro do período solicitado para evitar "vazamento"
            // Se o usuário pediu hoje, e o ponto de ontem 23:00 fosse manual, ele não seria pego pelo ISO-Start
            // Mas o ponto de AMANHÃ 04:00 (que pertence a HOJE) seria pego pelo estendido.
            const isoLogical = DateHelper.toIsoDate(dataFormatada);
            if (isoLogical >= isoInicio && isoLogical <= isoFim) {
              if (!manualPointsMap.has(key)) manualPointsMap.set(key, []);
              manualPointsMap.get(key)?.push(p);
            }
          }
        });

        // Garantir que todos os funcionários ativos tenham entrada para o dia solicitado se houver pontos manuais ou comentários
        // ou se for a data alvo (já feito acima). 
        // Agora vamos iterar sobre as chaves de pontos manuais e comentários para garantir que esses dias EXISTAM no array
        const allKeys = new Set([...commentsMap.keys(), ...manualPointsMap.keys()]);

        for (const key of allKeys) {
          const [matricula, dataStr] = key.split(':');
          const matriculaStr = String(matricula).trim();

          let md = marcacoesDia.find(m => String(m.matricula).trim() === matriculaStr && m.data === dataStr);

          if (!md) {
            // Buscar dados do funcionário para criar o dia
            // Reaproveitando a lista já buscada no início da função
            const emp = funcionariosAtivos.find(f => String(f.matricula).trim() === matriculaStr);

            if (emp) {
              md = new MarcacaoDia(0, '', matriculaStr, emp.nome, dataStr, [], emp.empresa, emp.trabalha_sabado === 1);
              marcacoesDia.push(md);
            }
          }
        }

        // Anexar dados aos dias
        marcacoesDia.forEach(md => {
          const key = `${String(md.matricula).trim()}:${md.data}`;

          if (commentsMap.has(key)) {
            md.comentarios = commentsMap.get(key);
          }

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

              // Evitar duplicatas em memória se já existir
              const exists = md.marcacoes.some(m =>
                m.numSerieRelogio === 'MANUAL' &&
                m.id === p.id
              );

              if (!exists) {
                md.marcacoes.push(new Marcacao({
                  id: p.id,
                  dataMarcacao: dateObj,
                  numSerieRelogio: 'MANUAL',
                  tipoRegistro: 99
                }));
              }
            });
            md.marcacoes.sort((a, b) => a.dataMarcacao.getTime() - b.dataMarcacao.getTime());
          }

          // Marcar pontos como desconsiderados
          const dayIgnoredSet = ignoredPointsMap.get(key);
          if (dayIgnoredSet) {
            md.marcacoes.forEach(m => {
              const mKey = m.numSerieRelogio === 'MANUAL'
                ? `manual:${m.id}`
                : `auto:${m.nsr || ''}:${m.numSerieRelogio || ''}`;

              if (dayIgnoredSet.has(mKey)) {
                m.desconsiderado = true;
              }
            });
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

    // Final sort: Date ASC, then Name ASC
    return marcacoesDia.sort((a, b) => {
      const dateA = DateHelper.toIsoDate(a.data);
      const dateB = DateHelper.toIsoDate(b.data);
      const dateCompare = dateA.localeCompare(dateB);
      if (dateCompare !== 0) return dateCompare;
      return a.nome.localeCompare(b.nome);
    });
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

  async saveManualMarcacao(matricula: string, data: string, hora: string, comentario?: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = { matricula, data, hora, criadoPor };

    try {
      await firstValueFrom(
        this.http.post<{ success: boolean, message: string }>(`${environment.apiUrlBackend}/marcacoes/manual`, body)
      );

      if (comentario) {
        await this.saveComment(matricula, data, comentario);
      }
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao salvar ponto manual:', error);
      throw error;
    }
  }

  async saveManualMarcacaoBatch(matriculas: string[], data: string, hora: string, comentario: string, commentDate?: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = {
      matriculas,
      data,
      hora,
      comentario,
      criadoPor,
      commentDate: commentDate || data
    };

    try {
      await firstValueFrom(
        this.http.post<{ success: boolean, message: string }>(`${environment.apiUrlBackend}/marcacoes/manual/batch-insert`, body)
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao salvar pontos manuais em lote:', error);
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

  async fetchIgnoredPointsBatch(matriculas: string[], dataInicio: string, dataFim: string): Promise<any[]> {
    const body = { matriculas, dataInicio, dataFim };

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean, ignoredPoints: any[] }>(`${environment.apiUrlBackend}/marcacoes/desconsiderar/batch`, body)
      );
      return response.success ? response.ignoredPoints : [];
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar pontos desconsiderados:', error);
      return [];
    }
  }

  async toggleDesconsiderarStatus(m: Marcacao, matricula: string, data: string, desconsiderar: boolean): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = {
      matricula,
      data: DateHelper.toIsoDate(data),
      marcacaoId: m.numSerieRelogio === 'MANUAL' ? m.id : undefined,
      nsr: m.numSerieRelogio !== 'MANUAL' ? m.nsr : undefined,
      relogioNs: m.numSerieRelogio !== 'MANUAL' ? m.numSerieRelogio : undefined,
      desconsiderar,
      criadoPor
    };

    try {
      await firstValueFrom(
        this.http.post<{ success: boolean }>(`${environment.apiUrlBackend}/marcacoes/desconsiderar`, body)
      );
      m.desconsiderado = desconsiderar;
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao alterar status de desconsideração:', error);
      throw error;
    }
  }

  private async fetchMarcacoes(dataInicio: string, dataFim: string, matriculaFuncionario?: string): Promise<Marcacao[]> {
    // Ajuste requested pelo usuário: adicionar sempre um dia ao dataFim
    let dataFimAjustada = dataFim;
    const dateObj = DateHelper.fromStringDate(dataFim);
    if (dateObj) {
      dateObj.setDate(dateObj.getDate() + 1);
      dataFimAjustada = DateHelper.getStringDate(dateObj);
    }

    try {
      let marcacoes: Marcacao[] = [];

      if (matriculaFuncionario) {
        marcacoes = await this.marcacaoApiService.getMarcacoesByEmployee(
          matriculaFuncionario,
          dataInicio,
          dataFimAjustada
        );
      } else {
        marcacoes = await this.marcacaoApiService.getAllMarcacoes(
          dataInicio,
          dataFimAjustada
        );
      }

      this.loggerService.info('MarcacaoService', `Encontradas ${marcacoes.length} marcações.`);
      return marcacoes;

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


  async getEmployeeHistory(matricula: string): Promise<any> {
    try {
      // 1. Definir período (últimos 7 dias)
      const range = DateHelper.getLastNDaysRange(7);

      // 2. Buscar marcações automáticas deste colaborador
      // Agora passando a matrícula para a API para filtrar no servidor
      const allMarcacoes = await this.fetchMarcacoes(range.start, range.end, matricula);
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

  async saveStandardInterval(matricula: string, data: string): Promise<void> {
    this.loggerService.info('MarcacaoService', `Lancando intervalo padrao para ${matricula} em ${data}`);

    // 12:00
    await this.saveManualMarcacao(matricula, data, '12:00');
    // 13:00
    await this.saveManualMarcacao(matricula, data, '13:00');
    // Comentário
    await this.saveComment(matricula, data, 'Comentário automático: Intervalo padrão inserido');
    // Status Corrigido
    await this.saveEvent(matricula, data, data, 'Corrigido', 'FIXO');
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
