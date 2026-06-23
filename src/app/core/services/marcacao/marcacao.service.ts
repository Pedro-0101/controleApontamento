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
  private relogioService = inject(RelogioService);

  private marcacoes = signal<Marcacao[]>([]);
  private marcacoesFiltradas = signal<MarcacaoDia[]>([]);
  private marcacaoesFiltradasBackup = signal<MarcacaoDia[]>([]);
  private isLoadingMarcacoes = signal(false);
  private hasLoadedOnce = signal(false);
  private isBackgroundRefreshing = signal(false);


  // Verdadeiro enquanto carrega OU enquanto nunca carregou (garante skeleton no primeiro acesso)
  readonly _isLoadingMarcacoes = computed(() => !this.hasLoadedOnce() || this.isLoadingMarcacoes());
  readonly _isBackgroundRefreshing = computed(() => this.isBackgroundRefreshing());
  readonly _marcacoes = computed(() => this.marcacoes());
  readonly _marcacoesFiltradas = computed(() => this.marcacoesFiltradas());
  readonly _marcacoesFiltradasBackup = computed(() => this.marcacaoesFiltradasBackup());
  readonly _empresasFiltroPainel = computed(() => {
    const backup = this.marcacaoesFiltradasBackup();
    const empresasUnicas = [...new Set(backup.map(m => m.empresa).filter(e => !!e))].sort();
    return empresasUnicas.map(empresa => ({
      label: `${empresa} (${backup.filter(m => m.empresa === empresa && this.matchesOtherFilters(m, { skipEmpresa: true })).length})`,
      value: empresa
    }));
  });

  readonly _locaisFiltroPainel = computed(() => {
    const backup = this.marcacaoesFiltradasBackup();
    const locaisUnicos = [...new Set(backup.map(m => m.local).filter(l => !!l))].sort();
    return locaisUnicos.map(local => ({
      label: `${local} (${backup.filter(m => m.local === local && this.matchesOtherFilters(m, { skipLocal: true })).length})`,
      value: local
    }));
  });

  readonly _statusFiltroComContagem = computed(() => {
    const backup = this.marcacaoesFiltradasBackup();
    const counts = new Map<string, number>();
    backup.forEach(m => {
      if (this.matchesOtherFilters(m, { skipStatus: true })) {
        const status = m.getStatus();
        counts.set(status, (counts.get(status) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([status, count]) => ({ label: `${status} (${count})`, value: status }))
      .sort((a, b) => a.value.localeCompare(b.value));
  });

  readonly _relogiosFiltroPainel = computed(() => {
    const backup = this.marcacaoesFiltradasBackup();
    const numSeriesUnicas = new Set<string>();
    backup.forEach(dia =>
      dia.marcacoes.forEach(m => {
        const ns = this.relogioService.normalizeNumSerie(m.numSerieRelogio);
        if (ns) numSeriesUnicas.add(ns);
      })
    );
    return Array.from(numSeriesUnicas).map(numSerie => {
      const relogio = this.relogioService.getRelogioFromNumSerie(numSerie);
      const label = relogio.descricao && relogio.descricao !== 'Nao encontrado' ? relogio.descricao : numSerie;
      const count = backup.filter(dia =>
        dia.marcacoes.some(m => this.relogioService.normalizeNumSerie(m.numSerieRelogio) === numSerie) &&
        this.matchesOtherFilters(dia, { skipRelogio: true })
      ).length;
      return { label: `${label} (${count})`, value: numSerie };
    }).sort((a, b) => a.label.localeCompare(b.label));
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

  // ── Cards de métricas operacionais ────────────────────────────────────────

  private readonly AFASTAMENTO_EVENTOS = ['Ferias', 'Atestado', 'Afastado', 'Suspensao', 'Folga', 'Feriado', 'Licença Maternidade/ Paternidade', 'Licença Nojo'];

  readonly _totalFuncionarios = computed(() => this.marcacoesFiltradas().length);

  readonly _totalPresentes = computed(() =>
    this.marcacoesFiltradas().filter(m =>
      m.marcacoes.filter(mc => !mc.desconsiderado).length > 0
    ).length
  );

  readonly _totalAtrasoEntrada = computed(() =>
    this.marcacoesFiltradas().filter(m => this.temAtrasoEntrada(m)).length
  );

  readonly _totalAfastamentos = computed(() =>
    this.marcacoesFiltradas().filter(m => {
      const evtStr = m.evento ? m.evento.trim() : null;
      return evtStr !== null && this.AFASTAMENTO_EVENTOS.includes(evtStr);
    }).length
  );

  readonly _totalInconsistencias = computed(() =>
    this.marcacoesFiltradas().filter(m =>
      ['Falta', 'Atraso', 'Incompleto', 'Pendente'].includes(m.getStatus())
    ).length
  );

  private currentDataInicio = signal<string>('');
  private currentDataFim = signal<string>('');
  private statusFiltro = signal<string[]>([]);
  private empresasFiltro = signal<string[]>([]);
  private locaisFiltro = signal<string[]>([]);
  private filtroEspecial = signal<string[]>([]);
  private relogiosFiltro = signal<string[]>([]);

  // Cache de prefetch: chave = "dataInicio|dataFim", valor = MarcacaoDia[] já formatado
  private prefetchCache = new Map<string, { marcacoes: Marcacao[], marcacoesDia: MarcacaoDia[] }>();

  constructor() {
  }

  async updateMarcacoes(dataInicio: string, dataFim: string): Promise<Marcacao[]> {
    this.currentDataInicio.set(dataInicio);
    this.currentDataFim.set(dataFim);

    const cacheKey = `${dataInicio}|${dataFim}`;

    try {

      this.isLoadingMarcacoes.set(true);

      // Verificar se já existe no cache de prefetch
      const cached = this.prefetchCache.get(cacheKey);
      if (cached) {
        this.loggerService.info('MarcacaoService', `Usando dados do cache para ${dataInicio} - ${dataFim}`);
        this.prefetchCache.delete(cacheKey);

        this.marcacoes.set(cached.marcacoes);
        this.ordenarTodasMarcacoes(cached.marcacoesDia);
        this.marcacaoesFiltradasBackup.set(cached.marcacoesDia);
        this.applyFilters();
        this.hasLoadedOnce.set(true);
        this.isLoadingMarcacoes.set(false);
        return cached.marcacoes;
      }

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

      this.hasLoadedOnce.set(true);
      this.isLoadingMarcacoes.set(false);
      return marcacoes;

    } catch (error) {

      this.loggerService.error('MarcacaoService', 'Erro ao atualizar marcações \n' + error);
      this.marcacoes.set([]);
      this.hasLoadedOnce.set(true);
      this.isLoadingMarcacoes.set(false);
      return this.marcacoes();

    }
  }

  /**
   * Pré-carrega dados de um dia em background, sem afetar os signals da UI.
   */
  async prefetchMarcacoes(dataInicio: string, dataFim: string): Promise<void> {
    const cacheKey = `${dataInicio}|${dataFim}`;

    // Não prefetchar se já está em cache
    if (this.prefetchCache.has(cacheKey)) return;

    try {
      this.loggerService.info('MarcacaoService', `Prefetching dados para ${dataInicio} - ${dataFim}`);

      const marcacoes = await this.fetchMarcacoes(dataInicio, dataFim);
      const marcacoesOrdenadas = marcacoes.sort((a, b) => a.cpf.localeCompare(b.cpf));
      const marcacoesDia = await this.formatarMarcacoesPorDia(marcacoesOrdenadas, dataInicio, dataFim);

      this.prefetchCache.set(cacheKey, { marcacoes, marcacoesDia });
      this.loggerService.info('MarcacaoService', `Prefetch concluído para ${dataInicio}`);
    } catch (error) {
      this.loggerService.error('MarcacaoService', `Erro no prefetch para ${dataInicio}:`, error);
    }
  }

  clearPrefetchCache(cacheKey?: string): void {
    if (cacheKey) {
      this.prefetchCache.delete(cacheKey);
    } else {
      this.prefetchCache.clear();
    }
  }

  /**
   * Insere pontos manuais diretamente no estado em memória (atualização otimista).
   * Não faz chamada de API. O refresh em background posterior irá confirmar os dados.
   */
  appendManualPoints(matriculas: string[], data: string, hora: string): void {
    const [year, month, day] = data.split('-').map(Number);
    const [hour, min] = hora.split(':').map(Number);
    const dateObj = new Date(year, month - 1, day, hour, min);

    const logicalDate = new Date(dateObj);
    if (hour < 4) {
      logicalDate.setDate(logicalDate.getDate() - 1);
    }
    const logicalDataFormatada = DateHelper.getStringDate(logicalDate);

    const currentBackup = [...this.marcacaoesFiltradasBackup()];
    let modified = false;

    for (const matricula of matriculas) {
      const md = currentBackup.find(m =>
        String(m.matricula).trim() === String(matricula).trim() &&
        m.data === logicalDataFormatada
      );

      if (md) {
        const exists = md.marcacoes.some(m =>
          m.numSerieRelogio === 'MANUAL' && m.dataMarcacao.getTime() === dateObj.getTime()
        );
        if (!exists) {
          md.marcacoes.push(new Marcacao({ id: 0, dataMarcacao: dateObj, numSerieRelogio: 'MANUAL', tipoRegistro: 99 }));
          md.marcacoes.sort((a, b) => a.dataMarcacao.getTime() - b.dataMarcacao.getTime());
          modified = true;
        }
      }
    }

    if (modified) {
      this.marcacaoesFiltradasBackup.set(currentBackup);
      this.applyFilters();
    }
  }

  /**
   * Recarrega os dados completos em segundo plano sem mostrar o skeleton da tabela.
   * Usa o sinal _isBackgroundRefreshing para mostrar um indicador sutil na UI.
   */
  async backgroundRefreshMarcacoes(): Promise<void> {
    const dataInicio = this.currentDataInicio();
    const dataFim = this.currentDataFim();
    if (!dataInicio || !dataFim) return;

    this.isBackgroundRefreshing.set(true);
    try {
      const marcacoes = await this.fetchMarcacoes(dataInicio, dataFim);
      this.marcacoes.set(marcacoes);

      const marcacoesOrdenadas = marcacoes.sort((a, b) => a.cpf.localeCompare(b.cpf));
      const marcacoesPorDia = await this.formatarMarcacoesPorDia(marcacoesOrdenadas, dataInicio, dataFim);

      this.ordenarTodasMarcacoes(marcacoesPorDia);
      this.marcacaoesFiltradasBackup.set(marcacoesPorDia);
      this.applyFilters();
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro no refresh em background:', error);
    } finally {
      this.isBackgroundRefreshing.set(false);
    }
  }

  async getPerfilMensalFuncionario(matricula: string, dataInicio: string, dataFim: string): Promise<MarcacaoDia[]> {
    try {
      // Estende ±1 dia igual ao fetchMarcacoes para capturar batidas offline e lógica < 04:00
      const inicioObj = DateHelper.fromStringDate(dataInicio);
      const fimObj    = DateHelper.fromStringDate(dataFim);
      if (inicioObj) inicioObj.setDate(inicioObj.getDate() - 1);
      if (fimObj)    fimObj.setDate(fimObj.getDate() + 1);
      const inicioAjustado = inicioObj ? DateHelper.getStringDate(inicioObj) : dataInicio;
      const fimAjustado    = fimObj    ? DateHelper.getStringDate(fimObj)    : dataFim;

      // Chamada direta com MatriculaFuncionario no body (não busca todos os funcionários)
      const marcacoes = await this.marcacaoApiService.getMarcacoesByEmployee(
        matricula, inicioAjustado, fimAjustado
      );

      const filtradas = marcacoes.filter(m =>
        String(m.matriculaFuncionario).trim() === String(matricula).trim()
      );

      return await this.formatarMarcacoesPorDia(
        filtradas.sort((a, b) => a.cpf.localeCompare(b.cpf)),
        dataInicio,
        dataFim,
        [matricula]
      );
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar perfil mensal:', error);
      return [];
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
    const employeeDataMap = new Map<string, { nome: string, empresa: string, trabalha_sabado: number, local: string, cargo: string, data_admissao?: string, data_fim_experiencia?: string }>();
    try {
      const employeesBatch = await this.employeeService.getEmployeeNamesBatch(matriculasUnicas);
      employeesBatch.forEach(item => employeeDataMap.set(item.matricula, {
        nome: item.nome,
        empresa: item.empresa,
        trabalha_sabado: item.trabalha_sabado,
        local: item.local ?? '',
        cargo: item.cargo ?? '',
        data_admissao: item.data_admissao,
        data_fim_experiencia: item.data_fim_experiencia
      }));
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar dados dos funcionários em lote', error);
    }

    // 3. Agrupar marcações usando Map (Lookup O(1))
    const gruposMap = new Map<string, MarcacaoDia>();

    for (const marcacao of marcacoes) {
      // Lógica de Dia Lógico: Batidas antes das 04:00 pertencem à jornada do dia anterior
      const dataHora = new Date(marcacao.dataMarcacao);
      const logicalDate = new Date(dataHora);
      if (dataHora.getHours() < 4) {
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
        const local = empData ? (empData.local ?? '') : '';
        const cargo = empData ? (empData.cargo ?? '') : '';

        const marcacaoDia = new MarcacaoDia(
          marcacao.id,
          marcacao.cpf,
          marcacao.matriculaFuncionario,
          nome,
          dateStr,
          [marcacao],
          empresa,
          empData ? (empData.trabalha_sabado === 1) : true,
          undefined,
          local,
          cargo
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
        // Garantir que marcacoesDia só contenha os alvos (a API pode retornar mais registros)
        const alvosSet = new Set(matriculasAlvo.map(m => String(m).trim()));
        marcacoesDia = marcacoesDia.filter(m => alvosSet.has(String(m.matricula).trim()));
      } else {
        funcionariosAtivos = await this.employeeService.getAllActiveEmployees();
        
        // FILTRAR INATIVOS: Remover marcações de funcionários que bateram ponto mas estão inativos
        const ativosSet = new Set(funcionariosAtivos.map(f => String(f.matricula).trim()));
        marcacoesDia = marcacoesDia.filter(m => ativosSet.has(String(m.matricula).trim()));
      }

      // FILTRAR POR ADMISSÃO: Remover marcações de funcionários que bateram ponto ANTES da admissão
      const employeesMap = new Map(funcionariosAtivos.map(f => [String(f.matricula).trim(), f]));
      marcacoesDia = marcacoesDia.filter(m => {
        const emp = employeesMap.get(String(m.matricula).trim());
        if (emp && emp.data_admissao) {
          const isoData = DateHelper.toIsoDate(m.data);
          const isoAdmissao = DateHelper.toIsoDate(emp.data_admissao);
          return isoData >= isoAdmissao;
        }
        return true;
      });

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
          // FILTRAR POR ADMISSÃO: Se a data do loop for anterior à admissão, pula a criação do dia vazio
          if (funcionario.data_admissao) {
            const isoDateStr = DateHelper.toIsoDate(dateStr);
            const isoAdmissao = DateHelper.toIsoDate(funcionario.data_admissao);
            if (isoDateStr < isoAdmissao) continue;
          }

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
              funcionario.trabalha_sabado === 1,
              undefined,
              funcionario.local ?? '',
              funcionario.cargo ?? ''
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

        // Ajuste: Buscar manual points até o dia seguinte para capturar batidas < 04:00
        const dataFimObj = DateHelper.fromStringDate(dataFim);
        if (dataFimObj) dataFimObj.setDate(dataFimObj.getDate() + 1);
        const isoFimAjustado = dataFimObj ? DateHelper.toIsoDate(DateHelper.getStringDate(dataFimObj)) : isoFim;

        const [comments, manualPoints, events, ignoredPoints] = await Promise.all([
          this.fetchCommentsBatch(allMatriculas, isoInicio, isoFim),
          this.fetchManualPointsBatch(allMatriculas, isoInicio, isoFimAjustado),
          this.fetchEventsBatch(allMatriculas, isoInicio, isoFim),
          this.fetchIgnoredPointsBatch(allMatriculas, isoInicio, isoFimAjustado)
        ]);

        // Ordenar os eventos do mais recente para o mais antigo (maior ID = mais recente)
        // Assim, quando houver múltiplos eventos para o mesmo dia, o 'find' pegará o mais recente.
        if (events && events.length > 0) {
          events.sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
        }

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
              md = new MarcacaoDia(0, '', matriculaStr, emp.nome, dataStr, [], emp.empresa, emp.trabalha_sabado === 1, undefined, emp.local ?? '', emp.cargo ?? '');
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
          const isoDateMd = DateHelper.toIsoDate(md.data).substring(0, 10);
          const activeEvent = events.find((e: any) => {
            const dataInicioStr = e.data_inicio ? String(e.data_inicio).substring(0, 10) : '';
            const dataFimStr = e.data_fim ? String(e.data_fim).substring(0, 10) : '';
            
            if (!dataInicioStr && !dataFimStr) return false;
            
            const startStr = dataInicioStr || dataFimStr;
            const endStr = dataFimStr || dataInicioStr;
            
            const minDate = startStr <= endStr ? startStr : endStr;
            const maxDate = startStr > endStr ? startStr : endStr;
            
            return String(e.matricula_funcionario).trim() === String(md.matricula).trim() &&
              isoDateMd >= minDate &&
              isoDateMd <= maxDate;
          });

          if (activeEvent) {
            md.evento = activeEvent.tipo_evento;
            md.evento_categoria = activeEvent.categoria;
            md.eventoCriadoEm = activeEvent.criado_em;
            md.eventoCriadoPor = activeEvent.criado_por;
          }
        });
      }
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar comentários ou pontos manuais:', error);
    }

    // Filtrar estritamente pelo período solicitado para remover pontos offline
    // que sincronizaram nos dias consultados (dataInsercao),
    // mas cuja data de marcação real (dataMarcacao) não pertence a esses dias
    const inicioDate = DateHelper.fromStringDate(dataInicio);
    const fimDate = DateHelper.fromStringDate(dataFim);

    // Ensure fimDate contains the entire last day
    if (fimDate) {
      fimDate.setHours(23, 59, 59, 999);
    }

    let filtradas = marcacoesDia;

    if (inicioDate && fimDate) {
      filtradas = marcacoesDia.filter(md => {
        const dataObj = DateHelper.fromStringDate(md.data);
        if (!dataObj) return false;
        const time = dataObj.getTime();
        return time >= inicioDate.getTime() && time <= fimDate.getTime();
      });
    }

    // Garantir que as marcações dentro de cada dia estejam em ordem cronológica
    filtradas.forEach(md => {
      md.marcacoes.sort((a, b) => a.dataMarcacao.getTime() - b.dataMarcacao.getTime());
    });

    // Final sort: Date ASC, then Name ASC
    return filtradas.sort((a, b) => {
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

  async saveEvent(matricula: string, dataInicio: string, dataFim: string, tipoEvento: string, categoria: 'PERIODO' | 'FIXO' = 'PERIODO', detalhes?: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = { matricula, dataInicio, dataFim, tipoEvento, criadoPor, categoria, detalhes: detalhes || '' };

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

  async fetchHistoricoBatch(matriculas: string[], dataInicio: string, dataFim: string): Promise<any[]> {
    const body = { matriculas, dataInicio, dataFim };

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean, history: any[] }>(`${environment.apiUrlBackend}/marcacoes/historico/batch`, body)
      );
      return response.success ? response.history : [];
    } catch (error) {
      this.loggerService.error('MarcacaoService', 'Erro ao buscar histórico:', error);
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
    // Estende o intervalo em ±1 dia para capturar batidas offline que sincronizaram
    // no dia seguinte e batidas antes das 04:00 que pertencem à jornada do dia anterior.
    let dataInicioAjustada = dataInicio;
    let dataFimAjustada = dataFim;

    const inicioObj = DateHelper.fromStringDate(dataInicio);
    if (inicioObj) {
      inicioObj.setDate(inicioObj.getDate() - 1);
      dataInicioAjustada = DateHelper.getStringDate(inicioObj);
    }

    const fimObj = DateHelper.fromStringDate(dataFim);
    if (fimObj) {
      fimObj.setDate(fimObj.getDate() + 1);
      dataFimAjustada = DateHelper.getStringDate(fimObj);
    }

    try {
      let marcacoes: Marcacao[] = [];

      if (matriculaFuncionario) {
        marcacoes = await this.marcacaoApiService.getMarcacoesByEmployee(
          matriculaFuncionario,
          dataInicioAjustada,
          dataFimAjustada
        );
      } else {
        marcacoes = await this.marcacaoApiService.getAllMarcacoes(
          dataInicioAjustada,
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
    return ['BH', 'BH do Atraso', 'Descontar Atraso', 'Falta Confirmada', 'Corrigido', 'Folga'];
  }

  static getPeriodEvents(): string[] {
    return ['Ferias', 'Atestado', 'Afastado', 'Suspensao', 'Feriado', 'BH', 'Licença Maternidade/ Paternidade', 'Licença Nojo'];
  }

  filtrarMarcacoesPorEmpresa(empresas: string[]): void {
    this.empresasFiltro.set(empresas);
    this.applyFilters();
  }

  filtrarMarcacoesPorStatus(status: string[]): void {
    this.statusFiltro.set(status);
    this.applyFilters();
  }

  filtrarMarcacoesPorLocal(locais: string[]): void {
    this.locaisFiltro.set(locais);
    this.applyFilters();
  }

  filtrarMarcacoesPorFiltroEspecial(filtros: string[]): void {
    this.filtroEspecial.set(filtros);
    this.applyFilters();
  }

  filtrarMarcacoesPorRelogio(numSeries: string[]): void {
    this.relogiosFiltro.set(numSeries);
    this.applyFilters();
  }

  private matchesOtherFilters(dia: MarcacaoDia, skip: {
    skipEmpresa?: boolean;
    skipLocal?: boolean;
    skipStatus?: boolean;
    skipRelogio?: boolean;
  } = {}): boolean {
    if (!skip.skipEmpresa) {
      const empresas = this.empresasFiltro();
      if (empresas.length > 0 && !(dia.empresa && empresas.includes(dia.empresa))) return false;
    }
    if (!skip.skipLocal) {
      const locais = this.locaisFiltro();
      if (locais.length > 0 && !(dia.local && locais.includes(dia.local))) return false;
    }
    if (!skip.skipStatus) {
      const statuses = this.statusFiltro().map(s => s.toLowerCase());
      if (statuses.length > 0 && !statuses.includes((dia.getStatus() || '').toLowerCase())) return false;
    }
    if (!skip.skipRelogio) {
      const relogios = this.relogiosFiltro();
      if (relogios.length > 0 && !dia.marcacoes.some(m => relogios.includes(this.relogioService.normalizeNumSerie(m.numSerieRelogio)))) return false;
    }
    const filtrosEspeciais = this.filtroEspecial();
    if (filtrosEspeciais.includes('almoco_irregular') && !this.temAlmocoIrregular(dia)) return false;
    if (filtrosEspeciais.includes('atraso_entrada') && !this.temAtrasoEntrada(dia)) return false;
    if (filtrosEspeciais.includes('com_marcacoes') && dia.marcacoes.filter(m => !m.desconsiderado).length === 0) return false;
    return true;
  }

  private temAtrasoEntrada(dia: MarcacaoDia): boolean {
    const ativas = dia.marcacoes.filter(m => !m.desconsiderado);
    if (ativas.length === 0) return false;
    const primeira = ativas[0].dataMarcacao;
    const hora = primeira.getHours();
    const minuto = primeira.getMinutes();
    return hora > 7 || (hora === 7 && minuto > 0);
  }

  private temAlmocoIrregular(dia: MarcacaoDia): boolean {
    const marcacoesAtivas = dia.marcacoes.filter(m => !m.desconsiderado);
    if (marcacoesAtivas.length !== 4) return false;

    const almocoInicio = marcacoesAtivas[1].dataMarcacao;
    const almocoFim = marcacoesAtivas[2].dataMarcacao;
    const diffMinutos = (almocoFim.getTime() - almocoInicio.getTime()) / (1000 * 60);

    return diffMinutos < 55 || diffMinutos > 65;
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

    const locais = this.locaisFiltro();
    if (locais.length > 0) {
      filtradas = filtradas.filter(dia =>
        dia.local && locais.includes(dia.local)
      );
    }

    const relogios = this.relogiosFiltro();
    if (relogios.length > 0) {
      filtradas = filtradas.filter(dia =>
        dia.marcacoes.some(m =>
          relogios.includes(this.relogioService.normalizeNumSerie(m.numSerieRelogio))
        )
      );
    }

    const filtrosEspeciais = this.filtroEspecial();
    if (filtrosEspeciais.includes('almoco_irregular')) {
      filtradas = filtradas.filter(dia => this.temAlmocoIrregular(dia));
    }
    if (filtrosEspeciais.includes('atraso_entrada')) {
      filtradas = filtradas.filter(dia => this.temAtrasoEntrada(dia));
    }
    if (filtrosEspeciais.includes('com_marcacoes')) {
      filtradas = filtradas.filter(dia => dia.marcacoes.filter(m => !m.desconsiderado).length > 0);
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
    // Status 'Corrigido' não é mais aplicado aqui incondicionalmente.
    // Os chamadores (detalhes, lote) simulam o status resultante e só aplicam
    // 'Corrigido' se o dia NÃO resultar em 'Atraso' ou 'Incompleto'.
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

  async updateEvent(id: number, dataInicio: string, dataFim: string, tipoEvento: string, detalhes?: string): Promise<void> {
    const criadoPor = this.authService._userName() || 'Sistema';
    const body = { dataInicio, dataFim, tipoEvento, criadoPor, detalhes: detalhes || '' };

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
