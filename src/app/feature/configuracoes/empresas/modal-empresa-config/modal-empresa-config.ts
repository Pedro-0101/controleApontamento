import { Component, EventEmitter, inject, input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  EmpresaConfig,
  EmpresaConfigService,
} from '../../../../core/services/empresa-config/empresa-config.service';
import { ToastService } from '../../../../core/services/toast/toast.service';

@Component({
  selector: 'app-modal-empresa-config',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './modal-empresa-config.html',
})
export class ModalEmpresaConfig implements OnInit {
  private service = inject(EmpresaConfigService);
  private toastService = inject(ToastService);

  mode     = input.required<'create' | 'edit'>();
  empresa  = input<EmpresaConfig | null>(null);

  @Output() close = new EventEmitter<void>();
  @Output() save  = new EventEmitter<void>();

  nome   = signal('');
  email  = signal('');
  senha  = signal('');
  chave  = signal('');

  isSaving  = signal(false);
  isTesting = signal(false);
  testeOk   = signal<boolean | null>(null);

  ngOnInit() {
    if (this.mode() === 'edit' && this.empresa()) {
      const e = this.empresa()!;
      this.nome.set(e.nome);
      this.email.set(e.email);
      this.chave.set(e.chave);
      this.senha.set('');
    }
  }

  getTitle() {
    return this.mode() === 'create' ? 'Nova Empresa' : 'Editar Empresa';
  }

  async testarConexao() {
    if (!this.chave().trim() || !this.email().trim()) {
      this.toastService.warning('Preencha o e-mail e a chave para testar');
      return;
    }
    this.isTesting.set(true);
    this.testeOk.set(null);
    try {
      // Para criar/editar: salva temporariamente ou usa o id existente
      if (this.mode() === 'edit' && this.empresa()) {
        const ok = await this.service.testarConexao(this.empresa()!.id);
        this.testeOk.set(ok);
        ok
          ? this.toastService.success('Conexão estabelecida com sucesso!')
          : this.toastService.error('Falha na conexão. Verifique as credenciais.');
      } else {
        this.toastService.warning('Salve a empresa primeiro para testar a conexão');
      }
    } finally {
      this.isTesting.set(false);
    }
  }

  async handleSave() {
    if (!this.nome().trim() || !this.email().trim() || !this.chave().trim()) {
      this.toastService.warning('Nome, e-mail e chave são obrigatórios');
      return;
    }
    if (this.mode() === 'create' && !this.senha().trim()) {
      this.toastService.warning('Senha é obrigatória para nova empresa');
      return;
    }

    this.isSaving.set(true);
    try {
      const data = {
        nome:  this.nome(),
        email: this.email(),
        senha: this.senha(),
        chave: this.chave(),
      };
      if (this.mode() === 'create') {
        await this.service.criar(data);
        this.toastService.success('Empresa criada com sucesso!');
      } else {
        await this.service.atualizar(this.empresa()!.id, data);
        this.toastService.success('Empresa atualizada com sucesso!');
      }
      this.save.emit();
    } catch {
      this.toastService.error('Erro ao salvar empresa. Verifique se a chave não está duplicada.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
