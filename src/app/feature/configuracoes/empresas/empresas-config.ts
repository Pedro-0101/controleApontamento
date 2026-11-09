import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { EmpresaConfig, EmpresaConfigService } from '../../../core/services/empresa-config/empresa-config.service';
import {
  ExecutarMarcacoesOptions,
  ExecutarVinculosOptions,
  ExataConta,
  ExataEmpresa,
  ExataListaResultado,
  ExataMonitoramento,
  ExataPontosStatus,
  ExataPontosSyncResultado,
  ExataResumo,
  ExataStatusFuncionario,
  ExataStatusListaResultado,
  ExataStatusSyncResultado,
  ExataSyncEmpresasResultado,
  ExataSyncFuncionariosResultado,
  ExataValidacaoResultado,
  MarcacoesSyncResultado,
  MarcacoesSyncStats,
  MarcacoesSyncStatus,
  SincronizacaoEmpresa,
  SincronizacaoHistorico,
  SincronizacaoResultado,
  SincronizacaoService,
  SincronizacaoStats,
  VinculoAplicarResultado,
  VinculoAcao,
  VinculoOpcoes,
  VinculoPreview,
  VinculoStatus,
  VinculoSyncResultado,
} from '../../../core/services/sincronizacao/sincronizacao.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import {
  AfdGeracao,
  AfdGerarResultado,
  AfdOperacao,
  AfdOperacaoInfo,
  AfdService,
} from '../../../core/services/afd/afd.service';
import {
  WebhookAssinatura,
  WebhookEvento,
  WebhookService,
  WebhookSyncResultado,
} from '../../../core/services/webhooks/webhook.service';
import { MultiSelectDropdown } from '../../../shared/multi-select-dropdown/multi-select-dropdown';
import { ModalEmpresaConfig } from './modal-empresa-config/modal-empresa-config';

@Component({
  selector: 'app-empresas-config',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MultiSelectDropdown, ModalEmpresaConfig],
  templateUrl: './empresas-config.html',
  styleUrl: './empresas-config.css',
})
export class EmpresasConfig implements OnInit {
  private service     = inject(EmpresaConfigService);
  private syncService = inject(SincronizacaoService);
  private afdService  = inject(AfdService);
  private webhookService = inject(WebhookService);
  private toastService = inject(ToastService);

  empresas   = signal<EmpresaConfig[]>([]);
  isLoading  = signal(false);

  /** Empresas que de fato usam a Ponto Certificado (sem a conta Exata). */
  empresasPontocertificado = computed(() =>
    this.empresas().filter((empresa) => empresa.provedor !== 'exata')
  );
  temPontoCertificado = computed(() => this.empresasPontocertificado().length > 0);
  showModal  = signal(false);
  modalMode  = signal<'create' | 'edit'>('create');
  selected   = signal<EmpresaConfig | null>(null);

  isSincronizando = signal(false);
  sincronizandoEmpresaId = signal<number | null>(null);
  ultimoResultado = signal<SincronizacaoResultado | null>(null);
  syncErro = signal<string | null>(null);

  showHistorico = signal(false);
  isLoadingHistorico = signal(false);
  historico = signal<SincronizacaoHistorico[]>([]);

  // Importação de marcações de ponto (Fase 3)
  isLoadingMarcacoesStatus = signal(false);
  isImportandoMarcacoes = signal(false);
  sincronizandoIncrementalId = signal<number | null>(null);
  marcacoesStatus = signal<MarcacoesSyncStatus[]>([]);
  ultimoResultadoMarcacoes = signal<MarcacoesSyncResultado | null>(null);
  marcacoesErro = signal<string | null>(null);
  temEmpresaSemCarga = computed(() =>
    this.marcacoesStatus().some((item) => Number(item.ultimo_id) === 0)
  );

  dataInicio = signal(this.isoDate(this.daysAgo(30)));
  dataFim = signal(this.isoDate(new Date()));
  empresaMarcacoesFiltro = signal('');
  matriculaFiltro = signal('');
  relogioFiltro = signal('');

  // Vínculos funcionário-relógio (Fase 4)
  showVinculos = signal(false);
  isLoadingVinculosOpcoes = signal(false);
  isLoadingVinculosStatus = signal(false);
  vinculosOpcoes = signal<VinculoOpcoes>({ funcionarios: [], relogios: [] });
  vinculosStatus = signal<VinculoStatus[]>([]);
  vinculosMatriculas = signal<string[]>([]);
  vinculosNumSeries = signal<string[]>([]);
  vinculosAcao = signal<VinculoAcao>('vincular');
  empresaVinculosFiltro = signal('');
  vinculosPreview = signal<VinculoPreview | null>(null);
  vinculosResultado = signal<VinculoAplicarResultado | null>(null);
  vinculosSyncResultado = signal<VinculoSyncResultado | null>(null);
  vinculosErro = signal<string | null>(null);
  isPreviewVinculos = signal(false);
  isAplicandoVinculos = signal(false);
  isSincronizandoVinculos = signal(false);

  // AFD — Portaria 671/MTP (Fase 5)
  showAfd = signal(false);
  isLoadingAfd = signal(false);
  isGerandoAfd = signal(false);
  afdOperacoes = signal<AfdOperacaoInfo[]>([]);
  afdGeracoes = signal<AfdGeracao[]>([]);
  afdOperacao = signal<AfdOperacao>('GeraAFD');
  afdEmpresaFiltro = signal('');
  afdDataInicio = signal(this.isoDate(this.daysAgo(30)));
  afdDataFim = signal(this.isoDate(new Date()));
  afdNumeroSerie = signal('');
  afdCabecalho = signal('');
  afdResultado = signal<AfdGerarResultado | null>(null);
  afdErro = signal<string | null>(null);

  // Webhooks (Fase 5)
  showWebhooks = signal(false);
  isLoadingWebhooks = signal(false);
  isCriandoWebhook = signal(false);
  isSincronizandoWebhooks = signal(false);
  webhookAssinaturas = signal<WebhookAssinatura[]>([]);
  webhookEventos = signal<WebhookEvento[]>([]);
  webhookSyncResultado = signal<WebhookSyncResultado | null>(null);
  webhookErro = signal<string | null>(null);
  webhookEmpresaId = signal('');
  webhookType = signal('Marcacao');
  webhookUri = signal('');

  // ExataWeb — empresas e funcionários (Fase 2, somente leitura)
  exataConta = signal<ExataConta | null>(null);
  exataEmpresas = signal<ExataEmpresa[]>([]);
  exataEmpresasLocais = signal<Array<{ id: number; nome: string }>>([]);
  exataResumo = signal<ExataResumo | null>(null);
  isLoadingExata = signal(false);
  isSincronizandoExataEmpresas = signal(false);
  isSincronizandoExataFuncionarios = signal(false);
  exataEmpresaSyncId = signal<number | null>(null);
  exataErro = signal<string | null>(null);
  exataEmpresasResultado = signal<ExataSyncEmpresasResultado | null>(null);
  exataFuncionariosResultado = signal<ExataSyncFuncionariosResultado | null>(null);

  // ExataWeb — marcações de ponto e baixa (Fase 3)
  exataPontosStatus = signal<ExataPontosStatus | null>(null);
  exataPontosResultado = signal<ExataPontosSyncResultado | null>(null);
  exataPontosErro = signal<string | null>(null);
  isSincronizandoExataPontos = signal(false);
  exataPontosModo = signal<'periodo' | 'incremental'>('periodo');
  exataDataInicio = signal(this.isoDate(this.daysAgo(30)));
  exataDataFim = signal(this.isoDate(new Date()));
  exataQtde = signal(100);
  exataEmpresaPontosId = signal('');

  // ExataWeb — status de funcionários (Fase 4)
  exataStatusLista = signal<ExataStatusListaResultado | null>(null);
  exataStatusResultado = signal<ExataStatusSyncResultado | null>(null);
  exataStatusErro = signal<string | null>(null);
  isSincronizandoExataStatus = signal(false);
  eventosLocais = signal<string[]>([]);

  // ExataWeb — coexistência, validação e monitoramento (Fase 6)
  exataMonitoramento = signal<ExataMonitoramento | null>(null);
  isCarregandoMonitoramentoExata = signal(false);
  exataValidacao = signal<ExataValidacaoResultado | null>(null);
  exataValidacaoErro = signal<string | null>(null);
  isCarregandoValidacaoExata = signal(false);
  exataValidacaoInicio = signal(this.isoDate(this.daysAgo(30)));
  exataValidacaoFim = signal(this.isoDate(new Date()));
  exataValidacaoEmpresaId = signal('');
  isAlterandoContaExata = signal(false);
  isExecutandoRolloutExata = signal(false);
  exataRolloutMensagem = signal<string | null>(null);

  async ngOnInit() {
    await Promise.all([
      this.carregar(),
      this.carregarStatusMarcacoes(),
      this.carregarStatusVinculos(),
      this.carregarExata(),
      this.carregarStatusPontosExata(),
      this.carregarStatusExata(),
      this.carregarMonitoramentoExata(),
    ]);
  }

  async carregarExata() {
    this.isLoadingExata.set(true);
    this.exataErro.set(null);
    try {
      const resultado = await this.syncService.listarExata();
      if (!resultado) return;
      this.aplicarEstadoExata(resultado);
    } catch (error: any) {
      this.exataErro.set(error?.error?.error || 'Não foi possível carregar as empresas da Exata');
    } finally {
      this.isLoadingExata.set(false);
    }
  }

  private aplicarEstadoExata(resultado: ExataListaResultado) {
    this.exataConta.set(resultado.conta);
    this.exataEmpresas.set(resultado.empresas || []);
    this.exataEmpresasLocais.set(resultado.empresasLocais || []);
    this.exataResumo.set(resultado.resumo || null);
  }

  async sincronizarEmpresasExata() {
    this.isSincronizandoExataEmpresas.set(true);
    this.exataErro.set(null);
    this.exataEmpresasResultado.set(null);

    try {
      const resultado = await this.syncService.sincronizarEmpresasExata();
      this.exataEmpresasResultado.set(resultado);

      if (resultado.status === 'CONCLUIDO') {
        this.toastService.success(`${resultado.recebidas} empresa(s) descoberta(s) na Exata`);
      } else if (resultado.status === 'PARCIAL') {
        this.toastService.warning('Descoberta concluída com falhas em algumas empresas');
      } else {
        this.toastService.error('Não foi possível descobrir as empresas da Exata');
      }

      await this.carregarExata();
      if (this.showHistorico()) await this.carregarHistorico();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao sincronizar empresas da Exata';
      this.exataErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isSincronizandoExataEmpresas.set(false);
    }
  }

  async sincronizarFuncionariosExata(empresa?: ExataEmpresa) {
    if (empresa) this.exataEmpresaSyncId.set(empresa.id);
    this.isSincronizandoExataFuncionarios.set(true);
    this.exataErro.set(null);
    this.exataFuncionariosResultado.set(null);

    try {
      const resultado = await this.syncService.sincronizarFuncionariosExata(
        empresa ? [empresa.id] : undefined
      );
      this.exataFuncionariosResultado.set(resultado);

      if (resultado.status === 'CONCLUIDO') {
        this.toastService.success(`${resultado.inseridos + resultado.atualizados} funcionário(s) sincronizado(s)`);
      } else if (resultado.status === 'PARCIAL') {
        this.toastService.warning('Sincronização concluída com falhas em algumas empresas');
      } else {
        this.toastService.error('Não foi possível sincronizar os funcionários da Exata');
      }

      await this.carregarExata();
      if (this.showHistorico()) await this.carregarHistorico();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao sincronizar funcionários da Exata';
      this.exataErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isSincronizandoExataFuncionarios.set(false);
      this.exataEmpresaSyncId.set(null);
    }
  }

  async mapearEmpresaExata(empresa: ExataEmpresa, valor: string) {
    const empresaId = valor ? Number(valor) : null;
    try {
      const atualizada = await this.syncService.atualizarEmpresaExata(empresa.id, {
        empresa_id: empresaId,
      });
      this.exataEmpresas.update((lista) =>
        lista.map((item) => (item.id === empresa.id ? { ...item, ...atualizada } : item))
      );
      this.toastService.success('Mapeamento atualizado');
      await this.carregarExata();
    } catch (error: any) {
      this.toastService.error(error?.error?.error || 'Erro ao atualizar o mapeamento');
    }
  }

  async toggleAtivoExata(empresa: ExataEmpresa) {
    try {
      await this.syncService.atualizarEmpresaExata(empresa.id, {
        ativo: empresa.ativo ? 0 : 1,
      });
      this.toastService.success(empresa.ativo ? 'Empresa desativada' : 'Empresa ativada');
      await this.carregarExata();
    } catch (error: any) {
      this.toastService.error(error?.error?.error || 'Erro ao alterar o status da empresa');
    }
  }

  resumoExataFuncionarios(resultado: ExataSyncFuncionariosResultado): string {
    const partes = [
      `${resultado.inseridos} novo(s)`,
      `${resultado.atualizados} atualizado(s)`,
    ];
    if (resultado.locaisInseridos > 0) partes.push(`${resultado.locaisInseridos} incluído(s) no cadastro local`);
    if (resultado.semEmpresaLocal > 0) partes.push(`${resultado.semEmpresaLocal} sem empresa local`);
    if (resultado.ignorados > 0) partes.push(`${resultado.ignorados} ignorado(s)`);
    return partes.join(' · ');
  }

  temErroExataFuncionarios(resultado: ExataSyncFuncionariosResultado): boolean {
    return (resultado.empresas || []).some((empresa) => !!empresa.erro);
  }

  // ── ExataWeb — marcações de ponto (Fase 3) ───────────────────────────────

  async carregarStatusPontosExata() {
    try {
      this.exataPontosStatus.set(await this.syncService.statusPontosExata());
    } catch {
      // Status é apenas informativo.
    }
  }

  private empresasExataSelecionadas(): number[] | undefined {
    const id = Number(this.exataEmpresaPontosId());
    return Number.isFinite(id) && id > 0 ? [id] : undefined;
  }

  async importarPeriodoExata() {
    const dataInicio = this.exataDataInicio();
    const dataFim = this.exataDataFim();
    if (!dataInicio || !dataFim) {
      this.toastService.warning('Informe a data inicial e a data final');
      return;
    }
    if (dataInicio > dataFim) {
      this.toastService.warning('A data inicial deve ser anterior à data final');
      return;
    }

    await this.executarPontosExata({
      modo: 'periodo',
      dataInicio,
      dataFim,
      empresasExataIds: this.empresasExataSelecionadas(),
      qtde: Number(this.exataQtde()) || 100,
    });
  }

  async sincronizarIncrementalExata() {
    await this.executarPontosExata({
      modo: 'incremental',
      empresasExataIds: this.empresasExataSelecionadas(),
      qtde: Number(this.exataQtde()) || 100,
    });
  }

  private async executarPontosExata(options: {
    modo: 'periodo' | 'incremental';
    dataInicio?: string;
    dataFim?: string;
    empresasExataIds?: number[];
    qtde?: number;
  }) {
    this.exataPontosModo.set(options.modo);
    this.isSincronizandoExataPontos.set(true);
    this.exataPontosErro.set(null);
    this.exataPontosResultado.set(null);

    try {
      const resultado = await this.syncService.sincronizarPontosExata(options);
      this.exataPontosResultado.set(resultado);

      if (resultado.status === 'CONCLUIDO') {
        this.toastService.success(
          `${resultado.inseridos + resultado.atualizados} marcação(ões) importada(s) e ${resultado.baixados} baixada(s)`
        );
      } else if (resultado.status === 'PARCIAL') {
        this.toastService.warning('Importação concluída com falhas em algumas empresas');
      } else {
        this.toastService.error('Não foi possível importar as marcações da Exata');
      }

      await Promise.all([this.carregarStatusPontosExata(), this.carregarExata()]);
      if (this.showHistorico()) await this.carregarHistorico();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao importar marcações da Exata';
      this.exataPontosErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isSincronizandoExataPontos.set(false);
    }
  }

  resumoPontosExata(resultado: ExataPontosSyncResultado): string {
    const partes = [
      `${resultado.buscados} buscada(s)`,
      `${resultado.inseridos} nova(s)`,
      `${resultado.atualizados} atualizada(s)`,
      `${resultado.baixados} baixada(s)`,
    ];
    if (resultado.ignorados > 0) partes.push(`${resultado.ignorados} ignorada(s)`);
    if (resultado.erros > 0) partes.push(`${resultado.erros} erro(s) de baixa`);
    return partes.join(' · ');
  }

  // ── ExataWeb — status de funcionários (Fase 4) ──────────────────────────

  async carregarStatusExata() {
    try {
      const resultado = await this.syncService.listarStatusExata();
      if (!resultado) return;
      this.exataStatusLista.set(resultado);
      this.eventosLocais.set(resultado.eventosDisponiveis || []);
    } catch {
      // A lista é complementar ao painel de empresas.
    }
  }

  async sincronizarStatusExata() {
    this.isSincronizandoExataStatus.set(true);
    this.exataStatusErro.set(null);
    this.exataStatusResultado.set(null);

    try {
      const resultado = await this.syncService.sincronizarStatusExata();
      this.exataStatusResultado.set(resultado);

      if (resultado.status === 'CONCLUIDO') {
        this.toastService.success(
          `${resultado.recebidos} status importado(s), ${resultado.eventosCriados + resultado.eventosAtualizados} evento(s) refletido(s)`
        );
      } else if (resultado.status === 'PARCIAL') {
        this.toastService.warning('Sincronização concluída com falhas em algumas empresas');
      } else {
        this.toastService.error('Não foi possível sincronizar os status da Exata');
      }

      await this.carregarStatusExata();
      if (this.showHistorico()) await this.carregarHistorico();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao sincronizar status da Exata';
      this.exataStatusErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isSincronizandoExataStatus.set(false);
    }
  }

  async mapearStatusExata(status: ExataStatusFuncionario, valor: string) {
    try {
      const atualizado = await this.syncService.atualizarStatusExata(
        status.id,
        valor || null
      );
      this.exataStatusLista.update((lista) => {
        if (!lista) return lista;
        return {
          ...lista,
          empresas: lista.empresas.map((empresa) => ({
            ...empresa,
            statuses: empresa.statuses.map((item) =>
              item.id === status.id ? { ...item, ...atualizado } : item
            ),
            eventos_mapeados: empresa.statuses.filter((item) =>
              item.id === status.id ? !!atualizado.evento_local : !!item.evento_local
            ).length,
          })),
        };
      });
      this.toastService.success('Mapeamento do status atualizado');
    } catch (error: any) {
      this.toastService.error(error?.error?.error || 'Erro ao atualizar o mapeamento do status');
    }
  }

  resumoStatusExata(resultado: ExataStatusSyncResultado): string {
    const partes = [
      `${resultado.recebidos} recebido(s)`,
      `${resultado.inseridos} novo(s)`,
      `${resultado.atualizados} atualizado(s)`,
      `${resultado.eventosCriados} evento(s) criado(s)`,
      `${resultado.eventosAtualizados} evento(s) atualizado(s)`,
    ];
    if (resultado.eventosRemovidos > 0) partes.push(`${resultado.eventosRemovidos} evento(s) removido(s)`);
    if (resultado.ignorados > 0) partes.push(`${resultado.ignorados} ignorado(s)`);
    return partes.join(' · ');
  }

  statusEventoLabel(evento: string | null): string {
    return evento || 'Sem mapeamento';
  }

  // ── ExataWeb — coexistência, validação e monitoramento (Fase 6) ──────────

  async alterarContaExata(ativo: boolean) {
    const acao = ativo ? 'ativar' : 'desativar (rollback)';
    if (!window.confirm(`Deseja ${acao} a conta ExataWeb? A Ponto Certificado não será afetada.`)) {
      return;
    }

    this.isAlterandoContaExata.set(true);
    try {
      await this.syncService.atualizarContaExata(ativo ? 1 : 0);
      this.toastService.success(`Conta ExataWeb ${ativo ? 'ativada' : 'desativada'}`);
      await Promise.all([this.carregarExata(), this.carregarMonitoramentoExata()]);
    } catch (error: any) {
      this.toastService.error(error?.error?.error || `Erro ao ${acao} a conta Exata`);
    } finally {
      this.isAlterandoContaExata.set(false);
    }
  }

  /**
   * Rollout da Fase 6: ativa a conta, descobre todas as empresas e executa as
   * sincronizações somente leitura (funcionários, status e pontos incrementais).
   */
  async executarRolloutExata() {
    if (this.isExecutandoRolloutExata()) return;
    if (!window.confirm(
      'Executar o rollout da ExataWeb? Isso ativa a conta, descobre todas as empresas e ' +
      'sincroniza funcionários, status e pontos incrementais. A Ponto Certificado continua ativa.'
    )) {
      return;
    }

    this.isExecutandoRolloutExata.set(true);
    this.exataRolloutMensagem.set('Ativando a conta ExataWeb...');
    this.exataErro.set(null);

    try {
      if (!this.exataConta()?.ativo) {
        await this.syncService.atualizarContaExata(1);
      }

      this.exataRolloutMensagem.set('Descobrindo empresas...');
      const empresas = await this.syncService.sincronizarEmpresasExata();
      this.exataEmpresasResultado.set(empresas);

      this.exataRolloutMensagem.set('Sincronizando funcionários...');
      const funcionarios = await this.syncService.sincronizarFuncionariosExata();
      this.exataFuncionariosResultado.set(funcionarios);

      this.exataRolloutMensagem.set('Sincronizando status de funcionários...');
      const status = await this.syncService.sincronizarStatusExata();
      this.exataStatusResultado.set(status);

      this.exataRolloutMensagem.set('Importando pontos incrementais...');
      const pontos = await this.syncService.sincronizarPontosExata({
        modo: 'incremental',
        qtde: Number(this.exataQtde()) || 100,
      });
      this.exataPontosResultado.set(pontos);

      this.exataRolloutMensagem.set('Atualizando painéis...');
      await Promise.all([
        this.carregarExata(),
        this.carregarStatusPontosExata(),
        this.carregarStatusExata(),
        this.carregarMonitoramentoExata(),
        this.carregarValidacaoExata(),
      ]);

      const resumo = [
        `${empresas.recebidas} empresa(s) descoberta(s)`,
        `${funcionarios.inseridos + funcionarios.atualizados} funcionário(s)`,
        `${status.eventosCriados + status.eventosAtualizados} evento(s) de status`,
        `${pontos.inseridos + pontos.atualizados} marcação(ões) importada(s)`,
      ].join(' · ');
      this.exataRolloutMensagem.set(`Rollout concluído: ${resumo}`);
      this.toastService.success('Rollout da ExataWeb concluído');
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro durante o rollout da ExataWeb';
      this.exataRolloutMensagem.set(null);
      this.exataErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isExecutandoRolloutExata.set(false);
    }
  }

  async carregarMonitoramentoExata() {
    this.isCarregandoMonitoramentoExata.set(true);
    try {
      this.exataMonitoramento.set(await this.syncService.monitoramentoExata());
    } catch {
      // O monitoramento é complementar; não bloqueia o restante da tela.
    } finally {
      this.isCarregandoMonitoramentoExata.set(false);
    }
  }

  async carregarValidacaoExata() {
    const dataInicio = this.exataValidacaoInicio();
    const dataFim = this.exataValidacaoFim();
    if (dataInicio && dataFim && dataInicio > dataFim) {
      this.exataValidacaoErro.set('A data inicial deve ser anterior à data final');
      return;
    }

    const empresaId = Number(this.exataValidacaoEmpresaId());
    this.isCarregandoValidacaoExata.set(true);
    this.exataValidacaoErro.set(null);
    try {
      this.exataValidacao.set(await this.syncService.validacaoExata({
        dataInicio,
        dataFim,
        empresasExataIds: Number.isFinite(empresaId) && empresaId > 0 ? [empresaId] : undefined,
      }));
    } catch (error: any) {
      this.exataValidacaoErro.set(
        error?.error?.error || 'Erro ao carregar as contagens de validação'
      );
    } finally {
      this.isCarregandoValidacaoExata.set(false);
    }
  }

  async exportarValidacaoExata() {
    const dataInicio = this.exataValidacaoInicio();
    const dataFim = this.exataValidacaoFim();
    const empresaId = Number(this.exataValidacaoEmpresaId());
    try {
      const blob = await this.syncService.exportarValidacaoExata({
        dataInicio,
        dataFim,
        empresasExataIds: Number.isFinite(empresaId) && empresaId > 0 ? [empresaId] : undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `validacao-exata-${dataInicio || 'inicio'}-a-${dataFim || 'fim'}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      this.toastService.error(error?.error?.error || 'Erro ao exportar a validação');
    }
  }

  async carregar() {
    this.isLoading.set(true);
    try {
      this.empresas.set(await this.service.listar());
    } finally {
      this.isLoading.set(false);
    }
  }

  abrirCriar() {
    this.selected.set(null);
    this.modalMode.set('create');
    this.showModal.set(true);
  }

  abrirEditar(e: EmpresaConfig) {
    this.selected.set(e);
    this.modalMode.set('edit');
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  async aoSalvar() {
    this.showModal.set(false);
    await this.carregar();
  }

  async toggleAtivo(e: EmpresaConfig) {
    try {
      if (e.ativo) {
        await this.service.desativar(e.id);
        this.toastService.success(`${e.nome} desativada`);
      } else {
        await this.service.atualizar(e.id, {
          nome: e.nome,
          email: e.email,
          senha: '',
          chave: e.chave,
          ativo: 1,
          empresa_id: e.empresa_id ?? null,
        });
        this.toastService.success(`${e.nome} ativada`);
      }
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao alterar status da empresa');
    }
  }

  async sincronizarTudo() {
    await this.executarSincronizacao();
  }

  async sincronizarEmpresa(e: EmpresaConfig) {
    this.sincronizandoEmpresaId.set(e.id);
    try {
      await this.executarSincronizacao([e.id]);
    } finally {
      this.sincronizandoEmpresaId.set(null);
    }
  }

  private async executarSincronizacao(empresaConfigIds?: number[]) {
    this.isSincronizando.set(true);
    this.syncErro.set(null);
    this.ultimoResultado.set(null);

    try {
      const resultado = await this.syncService.executar({ empresaConfigIds });
      this.ultimoResultado.set(resultado);

      if (resultado.status === 'CONCLUIDO') {
        this.toastService.success('Sincronização concluída com sucesso');
      } else if (resultado.status === 'PARCIAL') {
        this.toastService.warning('Sincronização concluída com falhas em algumas empresas');
      } else {
        this.toastService.error('Não foi possível sincronizar as empresas');
      }
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro de comunicação com o servidor';
      this.syncErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isSincronizando.set(false);
      if (this.showHistorico()) await this.carregarHistorico();
    }
  }

  async toggleHistorico() {
    const abrir = !this.showHistorico();
    this.showHistorico.set(abrir);
    if (abrir) await this.carregarHistorico();
  }

  private async carregarHistorico() {
    this.isLoadingHistorico.set(true);
    try {
      this.historico.set(await this.syncService.historico(10));
    } finally {
      this.isLoadingHistorico.set(false);
    }
  }

  async carregarStatusMarcacoes() {
    this.isLoadingMarcacoesStatus.set(true);
    try {
      this.marcacoesStatus.set(await this.syncService.statusMarcacoes());
    } catch {
      // O status é apenas informativo; não bloqueia o restante da tela.
    } finally {
      this.isLoadingMarcacoesStatus.set(false);
    }
  }

  async importarPeriodo() {
    const dataInicio = this.dataInicio();
    const dataFim = this.dataFim();

    if (!dataInicio || !dataFim) {
      this.toastService.warning('Informe a data inicial e a data final');
      return;
    }
    if (dataInicio > dataFim) {
      this.toastService.warning('A data inicial deve ser anterior à data final');
      return;
    }

    const empresa = this.empresaMarcacoesFiltro();
    const matricula = this.matriculaFiltro().trim();
    const relogio = this.relogioFiltro().trim();

    await this.executarMarcacoes({
      modo: 'periodo',
      dataInicio,
      dataFim,
      empresaConfigIds: empresa ? [Number(empresa)] : undefined,
      matriculaFuncionario: matricula || undefined,
      numSerieRelogio: relogio || undefined,
    });
  }

  async sincronizarIncrementalTodas() {
    await this.executarMarcacoes({ modo: 'incremental' });
  }

  async sincronizarIncrementalEmpresa(empresa: MarcacoesSyncStatus) {
    this.sincronizandoIncrementalId.set(empresa.empresa_config_id);
    await this.executarMarcacoes({
      modo: 'incremental',
      empresaConfigIds: [empresa.empresa_config_id],
    });
  }

  private async executarMarcacoes(options: ExecutarMarcacoesOptions) {
    this.isImportandoMarcacoes.set(true);
    this.marcacoesErro.set(null);
    this.ultimoResultadoMarcacoes.set(null);

    try {
      const resultado = await this.syncService.executarMarcacoes(options);
      this.ultimoResultadoMarcacoes.set(resultado);

      if (resultado.status === 'CONCLUIDO') {
        this.toastService.success('Marcações importadas com sucesso');
      } else if (resultado.status === 'PARCIAL') {
        this.toastService.warning('Importação concluída com falhas em algumas empresas');
      } else {
        this.toastService.error('Não foi possível importar as marcações');
      }

      await this.carregarStatusMarcacoes();
      if (this.showHistorico()) await this.carregarHistorico();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro de comunicação com o servidor';
      this.marcacoesErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isImportandoMarcacoes.set(false);
      this.sincronizandoIncrementalId.set(null);
    }
  }

  resumoMarcacoes(stats: MarcacoesSyncStats | null): string {
    if (!stats) return '—';
    const partes = [
      `${stats.inseridos} nova(s)`,
      `${stats.atualizados} atualizada(s)`,
    ];
    if (stats.ignorados > 0) partes.push(`${stats.ignorados} ignorada(s)`);
    return partes.join(' · ');
  }

  tipoMarcacoesLabel(tipo: string | null): string {
    if (!tipo) return 'Nenhuma carga';
    if (tipo === 'INCREMENTAL') return 'Incremental';
    if (tipo === 'PERIODO') return 'Período';
    return tipo;
  }

  async toggleVinculos() {
    const abrir = !this.showVinculos();
    this.showVinculos.set(abrir);
    if (abrir && this.vinculosOpcoes().funcionarios.length === 0) {
      await this.carregarOpcoesVinculos();
    }
    if (abrir) await this.carregarStatusVinculos();
  }

  private async carregarOpcoesVinculos() {
    this.isLoadingVinculosOpcoes.set(true);
    try {
      this.vinculosOpcoes.set(await this.syncService.opcoesVinculos());
    } catch {
      this.vinculosErro.set('Não foi possível carregar funcionários e relógios');
    } finally {
      this.isLoadingVinculosOpcoes.set(false);
    }
  }

  async carregarStatusVinculos() {
    this.isLoadingVinculosStatus.set(true);
    try {
      this.vinculosStatus.set(await this.syncService.statusVinculos());
    } catch {
      // O status é apenas informativo; não bloqueia o restante da tela.
    } finally {
      this.isLoadingVinculosStatus.set(false);
    }
  }

  onVinculosMatriculasChange(matriculas: string[]) {
    this.vinculosMatriculas.set(matriculas);
    this.vinculosPreview.set(null);
  }

  onVinculosNumSeriesChange(numSeries: string[]) {
    this.vinculosNumSeries.set(numSeries);
    this.vinculosPreview.set(null);
  }

  onVinculosAcaoChange(acao: string) {
    this.vinculosAcao.set(acao === 'desvincular' ? 'desvincular' : 'vincular');
    this.vinculosPreview.set(null);
  }

  onEmpresaVinculosChange(value: string) {
    this.empresaVinculosFiltro.set(value);
    this.vinculosPreview.set(null);
  }

  private opcoesVinculos(): ExecutarVinculosOptions {
    const empresa = this.empresaVinculosFiltro();
    return {
      matriculas: this.vinculosMatriculas(),
      numSeries: this.vinculosNumSeries(),
      acao: this.vinculosAcao(),
      empresaConfigIds: empresa ? [Number(empresa)] : undefined,
    };
  }

  private validarSelecaoVinculos(): boolean {
    if (this.vinculosMatriculas().length === 0) {
      this.toastService.warning('Selecione ao menos um funcionário');
      return false;
    }
    if (this.vinculosNumSeries().length === 0) {
      this.toastService.warning('Selecione ao menos um relógio');
      return false;
    }
    return true;
  }

  async gerarPreviewVinculos() {
    if (!this.validarSelecaoVinculos()) return;

    this.isPreviewVinculos.set(true);
    this.vinculosErro.set(null);
    this.vinculosPreview.set(null);
    this.vinculosResultado.set(null);

    try {
      const preview = await this.syncService.previewVinculos(this.opcoesVinculos());
      this.vinculosPreview.set(preview);

      if (preview.resumo.alteracoes === 0) {
        this.toastService.info('Nenhuma alteração pendente para a seleção');
      }
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao gerar prévia dos vínculos';
      this.vinculosErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isPreviewVinculos.set(false);
    }
  }

  async aplicarVinculos() {
    const preview = this.vinculosPreview();
    if (!preview || preview.resumo.alteracoes === 0) {
      this.toastService.warning('Gere a prévia antes de aplicar as alterações');
      return;
    }

    this.isAplicandoVinculos.set(true);
    this.vinculosErro.set(null);

    try {
      const resultado = await this.syncService.aplicarVinculos(this.opcoesVinculos());
      this.vinculosResultado.set(resultado);
      this.vinculosPreview.set(null);

      if (resultado.status === 'CONCLUIDO') {
        this.toastService.success('Vínculos aplicados com sucesso');
      } else if (resultado.status === 'PARCIAL') {
        this.toastService.warning('Vínculos aplicados com falhas em alguns pares');
      } else {
        this.toastService.error('Não foi possível aplicar os vínculos');
      }

      await this.carregarStatusVinculos();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao aplicar os vínculos';
      this.vinculosErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isAplicandoVinculos.set(false);
    }
  }

  async sincronizarVinculos() {
    const matriculas = this.vinculosMatriculas();
    if (matriculas.length === 0) {
      const confirmar = window.confirm(
        'Nenhum funcionário selecionado. Sincronizar os vínculos de todos os funcionários ativos das empresas selecionadas? Esta operação consulta a API por funcionário e pode demorar.'
      );
      if (!confirmar) return;
    }

    this.isSincronizandoVinculos.set(true);
    this.vinculosErro.set(null);
    this.vinculosSyncResultado.set(null);

    try {
      const empresa = this.empresaVinculosFiltro();
      const resultado = await this.syncService.sincronizarVinculos({
        empresaConfigIds: empresa ? [Number(empresa)] : undefined,
        matriculas: matriculas.length > 0 ? matriculas : undefined,
      });
      this.vinculosSyncResultado.set(resultado);

      if (resultado.status === 'CONCLUIDO') {
        this.toastService.success('Vínculos sincronizados com a API');
      } else if (resultado.status === 'PARCIAL') {
        this.toastService.warning('Sincronização concluída com falhas em alguns funcionários');
      } else {
        this.toastService.error('Não foi possível sincronizar os vínculos');
      }

      await this.carregarStatusVinculos();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao sincronizar os vínculos';
      this.vinculosErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isSincronizandoVinculos.set(false);
    }
  }

  async sincronizarVinculosEmpresa(item: VinculoStatus) {
    this.isSincronizandoVinculos.set(true);
    this.vinculosErro.set(null);
    this.vinculosSyncResultado.set(null);
    try {
      const resultado = await this.syncService.sincronizarVinculos({
        empresaConfigIds: [item.empresa_config_id],
      });
      this.vinculosSyncResultado.set(resultado);
      this.toastService.success(`Vínculos de ${item.nome} sincronizados`);
      await this.carregarStatusVinculos();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao sincronizar os vínculos';
      this.vinculosErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isSincronizandoVinculos.set(false);
    }
  }

  resumoVinculos(resultado: VinculoAplicarResultado | VinculoSyncResultado): string {
    const partes: string[] = [];
    if (resultado.vinculados > 0) partes.push(`${resultado.vinculados} vinculado(s)`);
    if (resultado.desvinculados > 0) partes.push(`${resultado.desvinculados} desvinculado(s)`);
    if ('inalterados' in resultado && resultado.inalterados > 0) {
      partes.push(`${resultado.inalterados} sem alteração`);
    }
    if (resultado.erros > 0) partes.push(`${resultado.erros} erro(s)`);
    return partes.length > 0 ? partes.join(' · ') : 'Nenhuma alteração';
  }

  // ── AFD (Fase 5) ──────────────────────────────────────────────────────────

  afdOperacaoAtual(): AfdOperacaoInfo | null {
    return this.afdOperacoes().find((item) => item.chave === this.afdOperacao()) || null;
  }

  afdExigeRelogio(): boolean {
    return this.afdOperacaoAtual()?.exigeRelogio === true;
  }

  async toggleAfd() {
    const abrir = !this.showAfd();
    this.showAfd.set(abrir);
    if (abrir) await this.carregarAfd();
  }

  async carregarAfd() {
    this.isLoadingAfd.set(true);
    this.afdErro.set(null);
    try {
      const [operacoes, geracoes] = await Promise.all([
        this.afdService.operacoes(),
        this.afdService.geracoes(30),
      ]);
      this.afdOperacoes.set(operacoes);
      this.afdGeracoes.set(geracoes);

      if (operacoes.length > 0 && !operacoes.some((op) => op.chave === this.afdOperacao())) {
        this.afdOperacao.set(operacoes[0].chave);
      }
    } catch (error: any) {
      this.afdErro.set(error?.error?.error || 'Não foi possível carregar as operações de AFD');
    } finally {
      this.isLoadingAfd.set(false);
    }
  }

  async gerarAfd() {
    if (!this.afdDataInicio() || !this.afdDataFim()) {
      this.toastService.warning('Informe a data inicial e a data final');
      return;
    }
    if (this.afdDataInicio() > this.afdDataFim()) {
      this.toastService.warning('A data inicial deve ser anterior à data final');
      return;
    }
    if (this.afdExigeRelogio() && !this.afdNumeroSerie().trim()) {
      this.toastService.warning('Informe o número de série do relógio');
      return;
    }

    this.isGerandoAfd.set(true);
    this.afdErro.set(null);
    this.afdResultado.set(null);

    try {
      const empresa = this.afdEmpresaFiltro();
      const resultado = await this.afdService.gerar({
        operacao: this.afdOperacao(),
        empresaConfigIds: empresa ? [Number(empresa)] : undefined,
        dataInicial: this.afdDataInicio(),
        dataFim: this.afdDataFim(),
        numeroSerie: this.afdExigeRelogio() ? this.afdNumeroSerie().trim() : undefined,
        numeroRelogioCabecalho:
          this.afdOperacao() === 'GeraAFDUnico' ? this.afdCabecalho().trim() || undefined : undefined,
      });
      this.afdResultado.set(resultado);

      if (resultado.success) {
        this.toastService.success('AFD gerado com sucesso');
      } else if (resultado.sucesso > 0) {
        this.toastService.warning('AFD gerado com falhas em algumas empresas');
      } else {
        this.toastService.error('Não foi possível gerar o AFD');
      }

      this.afdGeracoes.set(await this.afdService.geracoes(30));
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao gerar o AFD';
      this.afdErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isGerandoAfd.set(false);
    }
  }

  async baixarAfd(geracao: AfdGeracao) {
    try {
      await this.afdService.download(
        geracao.id,
        geracao.nome_arquivo || `afd-${geracao.id}.txt`
      );
    } catch {
      this.toastService.error('Não foi possível baixar o arquivo AFD');
    }
  }

  tamanhoArquivo(bytes: number): string {
    const valor = Number(bytes) || 0;
    if (valor >= 1024 * 1024) return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
    if (valor >= 1024) return `${(valor / 1024).toFixed(1)} KB`;
    return `${valor} B`;
  }

  // ── Webhooks (Fase 5) ─────────────────────────────────────────────────────

  async toggleWebhooks() {
    const abrir = !this.showWebhooks();
    this.showWebhooks.set(abrir);
    if (abrir) await this.carregarWebhooks();
  }

  async carregarWebhooks() {
    this.isLoadingWebhooks.set(true);
    this.webhookErro.set(null);
    try {
      const [assinaturas, eventos] = await Promise.all([
        this.webhookService.listar(),
        this.webhookService.eventos(30),
      ]);
      this.webhookAssinaturas.set(assinaturas);
      this.webhookEventos.set(eventos);
    } catch (error: any) {
      this.webhookErro.set(error?.error?.error || 'Não foi possível carregar os webhooks');
    } finally {
      this.isLoadingWebhooks.set(false);
    }
  }

  async sincronizarWebhooks() {
    this.isSincronizandoWebhooks.set(true);
    this.webhookErro.set(null);
    this.webhookSyncResultado.set(null);
    try {
      const resultado = await this.webhookService.sincronizar();
      this.webhookSyncResultado.set(resultado);

      if (resultado.success) {
        this.toastService.success(`${resultado.total} assinatura(s) sincronizada(s)`);
      } else {
        this.toastService.warning('Sincronização concluída com falhas em algumas empresas');
      }
      await this.carregarWebhooks();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao sincronizar webhooks';
      this.webhookErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isSincronizandoWebhooks.set(false);
    }
  }

  async criarWebhook() {
    const empresa = this.webhookEmpresaId();
    const tipo = this.webhookType().trim();
    const uri = this.webhookUri().trim();

    if (!empresa) {
      this.toastService.warning('Selecione a empresa da API');
      return;
    }
    if (!tipo) {
      this.toastService.warning('Informe o tipo do webhook');
      return;
    }
    if (uri && !/^https:\/\//i.test(uri)) {
      this.toastService.warning('A URL do webhook deve ser pública e usar HTTPS');
      return;
    }

    this.isCriandoWebhook.set(true);
    this.webhookErro.set(null);
    try {
      const assinatura = await this.webhookService.criar({
        empresaConfigId: Number(empresa),
        webhookType: tipo,
        webhookUri: uri || undefined,
      });
      this.toastService.success(`Webhook criado. Secret: ${assinatura.secret.slice(0, 6)}…`);
      if (assinatura.aviso) {
        this.toastService.warning(assinatura.aviso);
      }
      this.webhookUri.set('');
      await this.carregarWebhooks();
    } catch (error: any) {
      const mensagem = error?.error?.error || 'Erro ao criar webhook';
      this.webhookErro.set(mensagem);
      this.toastService.error(mensagem);
    } finally {
      this.isCriandoWebhook.set(false);
    }
  }

  async atualizarWebhook(item: WebhookAssinatura) {
    const uri = window.prompt('Nova URL pública HTTPS de callback:', item.webhook_uri);
    if (uri === null) return;
    if (!/^https:\/\//i.test(uri.trim())) {
      this.toastService.warning('A URL do webhook deve ser pública e usar HTTPS');
      return;
    }

    try {
      await this.webhookService.atualizarUri(item.id, uri.trim());
      this.toastService.success('URL do webhook atualizada');
      await this.carregarWebhooks();
    } catch (error: any) {
      this.toastService.error(error?.error?.error || 'Erro ao atualizar webhook');
    }
  }

  async usarCallbackLocal(item: WebhookAssinatura) {
    if (!window.confirm('Registrar na API externa a URL de callback local com o secret desta assinatura?')) {
      return;
    }

    try {
      await this.webhookService.atualizarUri(item.id, item.callback_url);
      this.toastService.success('URL de callback local registrada na API');
      await this.carregarWebhooks();
    } catch (error: any) {
      this.toastService.error(error?.error?.error || 'Erro ao registrar a URL de callback');
    }
  }

  async desativarWebhook(item: WebhookAssinatura) {
    if (!window.confirm(`Desativar localmente a assinatura "${item.webhook_type}" de ${item.empresa_config_nome}?`)) {
      return;
    }

    try {
      await this.webhookService.desativar(item.id);
      this.toastService.success('Assinatura desativada');
      await this.carregarWebhooks();
    } catch (error: any) {
      this.toastService.error(error?.error?.error || 'Erro ao desativar webhook');
    }
  }

  async copiar(texto: string, mensagem = 'Copiado para a área de transferência') {
    try {
      await navigator.clipboard.writeText(texto);
      this.toastService.success(mensagem);
    } catch {
      this.toastService.error('Não foi possível copiar');
    }
  }

  private daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private isoDate(date: Date): string {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
  }

  resumoStats(stats: SincronizacaoStats | null): string {
    if (!stats) return '—';
    const partes = [
      `${stats.inseridos} novo(s)`,
      `${stats.atualizados} atualizado(s)`,
      `${stats.inalterados} sem alteração`,
    ];
    if (stats.statusDivergentes > 0) partes.push(`${stats.statusDivergentes} status divergente(s)`);
    if (stats.semEmpresa > 0) partes.push(`${stats.semEmpresa} sem empresa local`);
    if (stats.ignorados > 0) partes.push(`${stats.ignorados} ignorado(s)`);
    return partes.join(' · ');
  }

  statusLabel(empresa: SincronizacaoEmpresa): string {
    return empresa.erro ? 'Erro' : 'Concluído';
  }
}
