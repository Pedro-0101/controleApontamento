import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { EmpresaService } from '../../../core/services/empresa/empresa.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { Empresa } from '../../../models/empresa/empresa';
import { TitleCaseCustomPipe } from '../../../shared/pipes/title-case-custom.pipe';

@Component({
  selector: 'app-empresas-lista',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, TitleCaseCustomPipe],
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
  logoData   = signal<string>('');

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
    this.logoData.set('');
    this.modalMode.set('create');
    this.showModal.set(true);
  }

  abrirEditar(e: Empresa) {
    this.selected.set(e);
    this.nomeInput.set(e.nome);
    this.logoData.set(e.logo || '');
    this.modalMode.set('edit');
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toastService.warning('Selecione um arquivo de imagem válido');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toastService.warning('Imagem muito grande (máx. 5 MB)');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.logoData.set(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  }

  removerLogo() {
    this.logoData.set('');
  }

  async handleSave() {
    if (!this.nomeInput().trim()) {
      this.toastService.warning('Nome é obrigatório');
      return;
    }
    this.isSaving.set(true);
    try {
      if (this.modalMode() === 'create') {
        await this.service.criar(this.nomeInput(), this.logoData() || undefined);
        this.toastService.success('Empresa criada com sucesso!');
      } else {
        await this.service.atualizar(this.selected()!.id, this.nomeInput(), this.selected()!.ativo, this.logoData() || null);
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
