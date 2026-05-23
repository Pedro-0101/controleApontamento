import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { EmpresaService } from '../../../core/services/empresa/empresa.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { Empresa } from '../../../models/empresa/empresa';

@Component({
  selector: 'app-empresas-lista',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './empresas-lista.html',
  styleUrl: './empresas-lista.css',
})
export class EmpresasLista implements OnInit {
  private service      = inject(EmpresaService);
  private toastService = inject(ToastService);

  empresas  = signal<Empresa[]>([]);
  isLoading = signal(false);
  showModal = signal(false);
  isSaving  = signal(false);

  modalMode  = signal<'create' | 'edit'>('create');
  selected   = signal<Empresa | null>(null);
  nomeInput  = signal('');

  async ngOnInit() {
    await this.carregar();
  }

  async carregar() {
    this.isLoading.set(true);
    try {
      this.empresas.set(await this.service.listar(true));
    } finally {
      this.isLoading.set(false);
    }
  }

  abrirCriar() {
    this.selected.set(null);
    this.nomeInput.set('');
    this.modalMode.set('create');
    this.showModal.set(true);
  }

  abrirEditar(e: Empresa) {
    this.selected.set(e);
    this.nomeInput.set(e.nome);
    this.modalMode.set('edit');
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  async handleSave() {
    if (!this.nomeInput().trim()) {
      this.toastService.warning('Nome é obrigatório');
      return;
    }
    this.isSaving.set(true);
    try {
      if (this.modalMode() === 'create') {
        await this.service.criar(this.nomeInput());
        this.toastService.success('Empresa criada com sucesso!');
      } else {
        await this.service.atualizar(this.selected()!.id, this.nomeInput(), this.selected()!.ativo);
        this.toastService.success('Empresa atualizada com sucesso!');
      }
      this.showModal.set(false);
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao salvar empresa. Verifique se o nome já não está em uso.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async toggleAtivo(e: Empresa) {
    try {
      if (e.ativo) {
        await this.service.desativar(e.id);
        this.toastService.success(`${e.nome} desativada`);
      } else {
        await this.service.ativar(e.id, e.nome);
        this.toastService.success(`${e.nome} ativada`);
      }
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao alterar status da empresa');
    }
  }
}
