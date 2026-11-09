import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { EmpresaConfig, EmpresaConfigService } from '../../../core/services/empresa-config/empresa-config.service';
import {
  ExecutarMarcacoesOptions,
  ExecutarVinculosOptions,
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

  async ngOnInit() {
    await Promise.all([
      this.carregar(),
      this.carregarStatusMarcacoes(),
      this.carregarStatusVinculos(),
    ]);
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
