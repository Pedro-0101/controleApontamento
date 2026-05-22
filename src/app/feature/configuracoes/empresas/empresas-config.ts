import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { EmpresaConfig, EmpresaConfigService } from '../../../core/services/empresa-config/empresa-config.service';
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
  private toastService = inject(ToastService);

  empresas   = signal<EmpresaConfig[]>([]);
  isLoading  = signal(false);
  showModal  = signal(false);
  modalMode  = signal<'create' | 'edit'>('create');
  selected   = signal<EmpresaConfig | null>(null);

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
          nome: e.nome, email: e.email, senha: '', chave: e.chave, ativo: 1
        });
        this.toastService.success(`${e.nome} ativada`);
      }
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao alterar status da empresa');
    }
  }
}
