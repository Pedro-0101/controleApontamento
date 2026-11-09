import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface SincronizacaoStats {
  inseridos: number;
  atualizados: number;
  inalterados: number;
  ignorados: number;
  statusDivergentes: number;
  semEmpresa: number;
}

export interface SincronizacaoEmpresa {
  empresa_config_id: number;
  nome: string;
  empresa_padrao: string | null;
  funcionarios: SincronizacaoStats | null;
  relogios: SincronizacaoStats | null;
  erro: string | null;
}

export interface SincronizacaoResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  duracaoMs: number;
  empresas: SincronizacaoEmpresa[];
}

export interface SincronizacaoHistorico {
  id: number;
  tipo: string;
  status: string;
  usuario: string | null;
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  empresas_processadas: number;
  resumo: {
    recursos?: string[];
    incluirNovos?: boolean;
    atualizarStatus?: boolean;
    empresas?: SincronizacaoEmpresa[];
  } | null;
  erro: string | null;
}

export interface ExecutarSincronizacaoOptions {
  empresaConfigIds?: number[];
  recursos?: Array<'funcionarios' | 'relogios'>;
  incluirNovos?: boolean;
  atualizarStatus?: boolean;
  usuario?: string;
}

export interface MarcacoesSyncStats {
  inseridos: number;
  atualizados: number;
  inalterados: number;
  ignorados: number;
  total: number;
  ultimoId: number;
}

export interface MarcacoesSyncEmpresa {
  empresa_config_id: number;
  nome: string;
  empresa_padrao: string | null;
  modo: 'periodo' | 'incremental';
  dataInicio: string | null;
  dataFim: string | null;
  periodos: number | null;
  marcacoes: MarcacoesSyncStats | null;
  ultimo_id: number | null;
  ultimo_id_anterior: number | null;
  erro: string | null;
}

export interface MarcacoesSyncResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  modo: 'periodo' | 'incremental';
  duracaoMs: number;
  empresas: MarcacoesSyncEmpresa[];
}

export interface MarcacoesSyncStatus {
  empresa_config_id: number;
  nome: string;
  ativo: number;
  ultimo_id: number;
  ultima_sincronizacao_em: string | null;
  ultima_sincronizacao_tipo: string | null;
  ultimo_total_importado: number;
}

export interface ExecutarMarcacoesOptions {
  empresaConfigIds?: number[];
  modo: 'periodo' | 'incremental';
  dataInicio?: string;
  dataFim?: string;
  matriculaFuncionario?: string;
  numSerieRelogio?: string;
  usuario?: string;
}

export type VinculoAcao = 'vincular' | 'desvincular';

export interface VinculoAlteracao {
  matricula: string;
  nome: string;
  empresa_config_id: number;
  empresa_config_nome: string;
  relogio_id: number | null;
  num_serie: string;
  descricao: string;
  acao: VinculoAcao;
}

export interface VinculoPreviewResumo {
  funcionarios: number;
  relogios: number;
  combinacoes: number;
  alteracoes: number;
  jaAplicados: number;
  semEmpresa: number;
  matriculasNaoEncontradas: number;
  relogiosDesconhecidos: number;
}

export interface VinculoPreview {
  success: boolean;
  acao: VinculoAcao;
  resumo: VinculoPreviewResumo;
  alteracoes: VinculoAlteracao[];
  truncado: boolean;
  matriculasNaoEncontradas: string[];
  relogiosDesconhecidos: string[];
  semEmpresa: Array<{ matricula: string; nome: string }>;
}

export interface VinculoEmpresaResultado {
  empresa_config_id: number;
  nome: string;
  vinculados: number;
  desvinculados: number;
  erros: number;
  erro: string | null;
}

export interface VinculoAplicarResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  acao: VinculoAcao;
  duracaoMs: number;
  resumo: VinculoPreviewResumo;
  empresas: VinculoEmpresaResultado[];
  vinculados: number;
  desvinculados: number;
  erros: number;
}

export interface VinculoSyncEmpresaResultado {
  empresa_config_id: number;
  nome: string;
  funcionarios: number;
  vinculados: number;
  desvinculados: number;
  inalterados: number;
  erros: number;
  erro: string | null;
}

export interface VinculoSyncResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  duracaoMs: number;
  resumo: {
    funcionarios: number;
    vinculados: number;
    desvinculados: number;
    inalterados: number;
    erros: number;
    semEmpresa: Array<{ matricula: string; nome: string }>;
    empresas: VinculoSyncEmpresaResultado[];
  };
  empresas: VinculoSyncEmpresaResultado[];
  vinculados: number;
  desvinculados: number;
  inalterados: number;
  erros: number;
}

export interface VinculoStatus {
  empresa_config_id: number;
  nome: string;
  ativo: number;
  empresa_id: number | null;
  empresa_nome: string | null;
  ultima_sincronizacao_em: string | null;
  ultima_sincronizacao_tipo: string | null;
  ultimo_total_vinculado: number;
  ultimo_total_desvinculado: number;
  total_funcionarios: number;
  total_vinculos_ativos: number;
  total_relogios: number;
}

export interface VinculoFuncionarioOpcao {
  id: number;
  matricula: string;
  nome: string;
  ativo: number;
  empresa_id: number | null;
  empresa: string;
}

export interface VinculoRelogioOpcao {
  id: number;
  num_serie: string;
  descricao: string;
  ativo: number;
  status: number;
}

export interface VinculoOpcoes {
  funcionarios: VinculoFuncionarioOpcao[];
  relogios: VinculoRelogioOpcao[];
}

export interface ExecutarVinculosOptions {
  matriculas: string[];
  numSeries: string[];
  acao: VinculoAcao;
  empresaConfigIds?: number[];
  usuario?: string;
}

export interface SincronizarVinculosOptions {
  empresaConfigIds?: number[];
  matriculas?: string[];
  usuario?: string;
}

export interface ExataConta {
  id: number;
  nome: string;
  ativo: number;
  provedor: string;
  ultima_execucao: {
    id: number;
    tipo: string;
    status: string;
    iniciado_em: string;
    finalizado_em: string | null;
    duracao_ms: number | null;
    erro: string | null;
  } | null;
}

export interface ExataEmpresa {
  id: number;
  empresa_config_id: number;
  empresasistema: number;
  empresacliente: number | null;
  descricao: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  ativo: number;
  sincronizado_em: string | null;
  total_funcionarios: number;
}

export interface ExataResumo {
  total: number;
  mapeadas: number;
  semMapeamento: number;
  inativas: number;
}

export interface ExataListaResultado {
  success: boolean;
  conta: ExataConta;
  empresas: ExataEmpresa[];
  resumo: ExataResumo;
  empresasLocais: Array<{ id: number; nome: string }>;
}

export interface ExataSyncEmpresasResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  duracaoMs: number;
  recebidas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: number;
  mapeadas: number;
  semMapeamento: number;
  erros: Array<{ empresasistema: number; descricao: string | null; erro: string }>;
}

export interface ExataSyncFuncionarioEmpresa {
  empresa_exata_id: number;
  empresasistema: number;
  descricao: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  recebidos: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  locais_inseridos: number;
  sem_empresa_local: number;
  erro: string | null;
}

export interface ExataSyncFuncionariosResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  duracaoMs: number;
  recebidos: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  locaisInseridos: number;
  semEmpresaLocal: number;
  empresas: ExataSyncFuncionarioEmpresa[];
}

export interface ExataPontosSyncEmpresa {
  empresa_exata_id: number;
  empresasistema: number;
  descricao: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  modo: 'periodo' | 'incremental';
  dataInicio: string | null;
  dataFim: string | null;
  dias: number;
  paginas: number;
  buscados: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  baixados: number;
  erros: number;
  erro: string | null;
}

export interface ExataPontosSyncResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  modo: 'periodo' | 'incremental';
  duracaoMs: number;
  buscados: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  baixados: number;
  erros: number;
  empresas: ExataPontosSyncEmpresa[];
}

export interface ExataPontosStatusEmpresa {
  id: number;
  empresasistema: number;
  descricao: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  ativo: number;
  ultima_data: string | null;
  ultimo_nsr: number | null;
  ultimo_reppid: number | null;
  ultima_execucao_em: string | null;
  ultimo_total: number | null;
  total_marcacoes: number;
  ultima_marcacao: string | null;
}

export interface ExataPontosStatus {
  success: boolean;
  conta: ExataConta;
  empresas: ExataPontosStatusEmpresa[];
  resumo: { total: number; ativas: number; marcacoes: number };
}

export interface ExecutarExataPontosOptions {
  empresasExataIds?: number[];
  modo: 'periodo' | 'incremental';
  dataInicio?: string;
  dataFim?: string;
  qtde?: number;
  usuario?: string;
}

export interface ExataStatusFuncionario {
  id: number;
  empresa_config_id: number;
  empresasistema: number;
  status_id: number;
  descricao: string | null;
  ponto_liberado: string | null;
  ativo: string | null;
  status_integra: string | null;
  factory: string | null;
  add_dias_status_fim: number | null;
  retorno_automatico: number | null;
  ultima_modificacao: string | null;
  evento_local: string | null;
  mapeamento_manual: number;
  sincronizado_em: string | null;
}

export interface ExataStatusEmpresa {
  id: number;
  empresasistema: number;
  descricao: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  ativo: number;
  statuses: ExataStatusFuncionario[];
  eventos_mapeados: number;
}

export interface ExataStatusListaResultado {
  success: boolean;
  conta: ExataConta;
  empresas: ExataStatusEmpresa[];
  eventosDisponiveis: string[];
}

export interface ExataStatusSyncEmpresa {
  empresa_exata_id: number;
  empresasistema: number;
  descricao: string | null;
  recebidos: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  eventos_criados: number;
  eventos_atualizados: number;
  eventos_removidos: number;
  sem_mapeamento: number;
  erro: string | null;
}

export interface ExataStatusSyncResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  duracaoMs: number;
  recebidos: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  eventosCriados: number;
  eventosAtualizados: number;
  eventosRemovidos: number;
  semMapeamento: number;
  empresas: ExataStatusSyncEmpresa[];
}

// ── ExataWeb (Fase 6) — validação, monitoramento e coexistência ────────────

export interface ExataValidacaoDia {
  data: string;
  total: number;
  funcionarios: number;
  exportados: number;
  pendentes: number;
  repps: number;
  primeiro_nsr: number | null;
  ultimo_nsr: number | null;
}

export interface ExataValidacaoEmpresa {
  empresa_exata_id: number;
  empresasistema: number;
  descricao: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  ativo: number;
  total: number;
  funcionarios: number;
  exportados: number;
  pendentes: number;
  repps: number;
  primeira_marcacao: string | null;
  ultima_marcacao: string | null;
  dias: ExataValidacaoDia[];
}

export interface ExataValidacaoResultado {
  success: boolean;
  conta: { id: number; nome: string; ativo: number };
  dataInicio: string;
  dataFim: string;
  resumo: {
    total: number;
    funcionarios: number;
    exportados: number;
    pendentes: number;
    empresas: number;
    empresasComDados: number;
    empresasAtivas: number;
    dias: number;
  };
  empresas: ExataValidacaoEmpresa[];
}

export interface ExataMonitoramentoExecucao {
  id: number;
  tipo: string;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  empresas_processadas: number | null;
  erro: string | null;
}

export interface ExataMonitoramento {
  success: boolean;
  conta: { id: number; nome: string; ativo: number };
  saude: 'OK' | 'ATENCAO';
  alertas: string[];
  pontos: {
    total: number;
    hoje: number;
    primeira_marcacao: string | null;
    ultima_marcacao: string | null;
    pendentes_baixa: number;
  };
  empresas: { total: number; ativas: number; sem_mapeamento: number };
  pendenciasBaixa: Array<{ empresasistema: number; total: number; mais_antiga: string | null }>;
  duplicidades: Array<{ empresasistema: number; reppid: number; nsr: number; total: number }>;
  ultimas: ExataMonitoramentoExecucao[];
  ultimasPorTipo: ExataMonitoramentoExecucao[];
}

export interface ExecutarExataValidacaoOptions {
  dataInicio?: string;
  dataFim?: string;
  empresasExataIds?: number[];
}

@Injectable({ providedIn: 'root' })
export class SincronizacaoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/sincronizacao`;

  async executar(options: ExecutarSincronizacaoOptions = {}): Promise<SincronizacaoResultado> {
    return firstValueFrom(
      this.http.post<SincronizacaoResultado>(`${this.apiUrl}/executar`, options)
    );
  }

  async historico(limit = 20): Promise<SincronizacaoHistorico[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; historico: SincronizacaoHistorico[] }>(
        `${this.apiUrl}/historico?limit=${limit}`
      )
    );
    return r.success ? r.historico : [];
  }

  async executarMarcacoes(options: ExecutarMarcacoesOptions): Promise<MarcacoesSyncResultado> {
    return firstValueFrom(
      this.http.post<MarcacoesSyncResultado>(`${this.apiUrl}/marcacoes`, options)
    );
  }

  async statusMarcacoes(): Promise<MarcacoesSyncStatus[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; status: MarcacoesSyncStatus[] }>(
        `${this.apiUrl}/marcacoes/status`
      )
    );
    return r.success ? r.status : [];
  }

  async previewVinculos(options: ExecutarVinculosOptions): Promise<VinculoPreview> {
    return firstValueFrom(
      this.http.post<VinculoPreview>(`${this.apiUrl}/vinculos/preview`, options)
    );
  }

  async aplicarVinculos(options: ExecutarVinculosOptions): Promise<VinculoAplicarResultado> {
    return firstValueFrom(
      this.http.post<VinculoAplicarResultado>(`${this.apiUrl}/vinculos/aplicar`, options)
    );
  }

  async sincronizarVinculos(options: SincronizarVinculosOptions = {}): Promise<VinculoSyncResultado> {
    return firstValueFrom(
      this.http.post<VinculoSyncResultado>(`${this.apiUrl}/vinculos/sincronizar`, options)
    );
  }

  async statusVinculos(): Promise<VinculoStatus[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; status: VinculoStatus[] }>(
        `${this.apiUrl}/vinculos/status`
      )
    );
    return r.success ? r.status : [];
  }

  async opcoesVinculos(): Promise<VinculoOpcoes> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; funcionarios: VinculoFuncionarioOpcao[]; relogios: VinculoRelogioOpcao[] }>(
        `${this.apiUrl}/vinculos/opcoes`
      )
    );
    return r.success
      ? { funcionarios: r.funcionarios || [], relogios: r.relogios || [] }
      : { funcionarios: [], relogios: [] };
  }

  // ── ExataWeb (Fase 2) ────────────────────────────────────────────────────

  async listarExata(): Promise<ExataListaResultado | null> {
    const r = await firstValueFrom(
      this.http.get<ExataListaResultado>(`${this.apiUrl}/exata`)
    );
    return r.success ? r : null;
  }

  async sincronizarEmpresasExata(usuario?: string): Promise<ExataSyncEmpresasResultado> {
    return firstValueFrom(
      this.http.post<ExataSyncEmpresasResultado>(
        `${this.apiUrl}/exata/empresas/sincronizar`,
        { usuario }
      )
    );
  }

  async atualizarEmpresaExata(
    id: number,
    dados: { empresa_id?: number | null; ativo?: number }
  ): Promise<ExataEmpresa> {
    const r = await firstValueFrom(
      this.http.put<{ success: boolean; empresa: ExataEmpresa }>(
        `${this.apiUrl}/exata/empresas/${id}`,
        dados
      )
    );
    if (!r.success) throw new Error('Erro ao atualizar empresa da Exata');
    return r.empresa;
  }

  async sincronizarFuncionariosExata(
    empresasExataIds?: number[],
    usuario?: string
  ): Promise<ExataSyncFuncionariosResultado> {
    return firstValueFrom(
      this.http.post<ExataSyncFuncionariosResultado>(
        `${this.apiUrl}/exata/funcionarios`,
        { empresasExataIds, usuario }
      )
    );
  }

  // ── ExataWeb (Fase 3) — marcações e baixa ───────────────────────────────

  async sincronizarPontosExata(
    options: ExecutarExataPontosOptions
  ): Promise<ExataPontosSyncResultado> {
    return firstValueFrom(
      this.http.post<ExataPontosSyncResultado>(`${this.apiUrl}/exata/pontos`, options)
    );
  }

  async statusPontosExata(): Promise<ExataPontosStatus | null> {
    const r = await firstValueFrom(
      this.http.get<ExataPontosStatus>(`${this.apiUrl}/exata/pontos/status`)
    );
    return r.success ? r : null;
  }

  // ── ExataWeb (Fase 4) — status de funcionários ──────────────────────────

  async sincronizarStatusExata(
    empresasExataIds?: number[],
    usuario?: string
  ): Promise<ExataStatusSyncResultado> {
    return firstValueFrom(
      this.http.post<ExataStatusSyncResultado>(
        `${this.apiUrl}/exata/status`,
        { empresasExataIds, usuario }
      )
    );
  }

  async listarStatusExata(): Promise<ExataStatusListaResultado | null> {
    const r = await firstValueFrom(
      this.http.get<ExataStatusListaResultado>(`${this.apiUrl}/exata/status`)
    );
    return r.success ? r : null;
  }

  async atualizarStatusExata(id: number, eventoLocal: string | null): Promise<ExataStatusFuncionario> {
    const r = await firstValueFrom(
      this.http.put<{ success: boolean; status: ExataStatusFuncionario }>(
        `${this.apiUrl}/exata/status/${id}`,
        { evento_local: eventoLocal }
      )
    );
    if (!r.success) throw new Error('Erro ao atualizar o mapeamento do status');
    return r.status;
  }

  // ── ExataWeb (Fase 6) — coexistência, validação e monitoramento ─────────

  async atualizarContaExata(
    ativo: number,
    usuario?: string
  ): Promise<ExataConta> {
    const r = await firstValueFrom(
      this.http.put<{ success: boolean; conta: ExataConta }>(
        `${this.apiUrl}/exata/conta`,
        { ativo, usuario }
      )
    );
    if (!r.success) throw new Error('Erro ao atualizar a conta Exata');
    return r.conta;
  }

  async validacaoExata(options: ExecutarExataValidacaoOptions = {}): Promise<ExataValidacaoResultado> {
    return firstValueFrom(
      this.http.get<ExataValidacaoResultado>(`${this.apiUrl}/exata/validacao`, {
        params: this.parametrosValidacaoExata(options),
      })
    );
  }

  async exportarValidacaoExata(options: ExecutarExataValidacaoOptions = {}): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.apiUrl}/exata/validacao`, {
        params: { ...this.parametrosValidacaoExata(options), formato: 'csv' },
        responseType: 'blob',
      })
    );
  }

  private parametrosValidacaoExata(options: ExecutarExataValidacaoOptions): Record<string, string> {
    const params: Record<string, string> = {};
    if (options.dataInicio) params['dataInicio'] = options.dataInicio;
    if (options.dataFim) params['dataFim'] = options.dataFim;
    if (options.empresasExataIds?.length) {
      params['empresasExataIds'] = options.empresasExataIds.join(',');
    }
    return params;
  }

  async monitoramentoExata(limite = 10): Promise<ExataMonitoramento> {
    return firstValueFrom(
      this.http.get<ExataMonitoramento>(`${this.apiUrl}/exata/monitoramento`, {
        params: { limite },
      })
    );
  }
}
