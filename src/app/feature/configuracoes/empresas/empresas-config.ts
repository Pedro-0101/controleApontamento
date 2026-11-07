import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { EmpresaConfig, EmpresaConfigService } from '../../../core/services/empresa-config/empresa-config.service';
import {
  SincronizacaoEmpresa,
  SincronizacaoHistorico,
  SincronizacaoResultado,
  SincronizacaoService,
  SincronizacaoStats,
} from '../../../core/services/sincronizacao/sincronizacao.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ModalEmpresaConfig } from './modal-empresa-config/modal-empresa-config';

@Component({
  selector: 'app-empresas-config',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ModalEmpresaConfig],
  templateUrl: './empresas-config.html',
  styleUrl: './empresas-config.css',
})
export class EmpresasConfig implements OnInit {
  private service     = inject(EmpresaConfigService);
  private syncService = inject(SincronizacaoService);
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

  async ngOnInit() {
    await this.carregar();
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
