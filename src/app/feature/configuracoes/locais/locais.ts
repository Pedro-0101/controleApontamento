import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { LocalService } from '../../../core/services/local/local.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { LocalModel } from '../../../models/local/local-model';

@Component({
  selector: 'app-locais',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './locais.html',
  styleUrl: './locais.css',
})
export class Locais implements OnInit {
  private service      = inject(LocalService);
  private toastService = inject(ToastService);

  locais    = signal<LocalModel[]>([]);
  isLoading = signal(false);
  showModal = signal(false);
  isSaving  = signal(false);

  modalMode  = signal<'create' | 'edit'>('create');
  selected   = signal<LocalModel | null>(null);
  nomeInput  = signal('');

  async ngOnInit() {
    await this.carregar();
  }

  async carregar() {
    this.isLoading.set(true);
    try {
      this.locais.set(await this.service.listar(true));
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

  abrirEditar(l: LocalModel) {
    this.selected.set(l);
    this.nomeInput.set(l.nome);
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
        this.toastService.success('Local criado com sucesso!');
      } else {
        await this.service.atualizar(this.selected()!.id, this.nomeInput(), this.selected()!.ativo);
        this.toastService.success('Local atualizado com sucesso!');
      }
      this.showModal.set(false);
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao salvar local. Verifique se o nome já não está em uso.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async toggleAtivo(l: LocalModel) {
    try {
      if (l.ativo) {
        await this.service.desativar(l.id);
        this.toastService.success(`${l.nome} desativado`);
      } else {
        await this.service.ativar(l.id, l.nome);
        this.toastService.success(`${l.nome} ativado`);
      }
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao alterar status do local');
    }
  }
}
