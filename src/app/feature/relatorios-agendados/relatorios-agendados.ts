import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { RelatorioAgendadoService } from '../../core/services/relatorio-agendado/relatorio-agendado.service';
import { LocalService } from '../../core/services/local/local.service';
import { EmpresaService } from '../../core/services/empresa/empresa.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { AuthService } from '../../core/services/auth/auth.service';
import {
  RelatorioAgendado,
  RelatorioAgendadoPayload,
  WhatsappStatus,
} from '../../models/relatorioAgendado/relatorio-agendado';
import { LocalModel } from '../../models/local/local-model';
import { Empresa } from '../../models/empresa/empresa';

interface OpcaoDia {
  valor: number;
  label: string;
}

@Component({
  selector: 'app-relatorios-agendados',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './relatorios-agendados.html',
  styleUrl: './relatorios-agendados.css',
})
export class RelatoriosAgendados implements OnInit, OnDestroy {
  private service = inject(RelatorioAgendadoService);
  private localService = inject(LocalService);
  private empresaService = inject(EmpresaService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);

  relatorios = signal<RelatorioAgendado[]>([]);
  locais = signal<LocalModel[]>([]);
  empresas = signal<Empresa[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  showModal = signal(false);
  modalMode = signal<'create' | 'edit'>('create');
  selected = signal<RelatorioAgendado | null>(null);

  whatsapp = signal<WhatsappStatus | null>(null);
  waLoading = signal(false);
  private waTimer: ReturnType<typeof setInterval> | null = null;

  readonly statusOptions = [
    'Falta',
    'Atraso',
    'Incompleto',
    'Ok',
    'Em andamento',
    'Pendente',
    'Não bate ponto',
    'Falta Confirmada',
    'Corrigido',
    'Folga',
    'BH',
    'BH do Atraso',
    'Descontar Atraso',
    'Ferias',
    'Atestado',
    'Afastado',
    'Suspensao',
    'Feriado',
    'Licença Maternidade/ Paternidade',
    'Licença Nojo',
  ];

  readonly diasOptions: OpcaoDia[] = [
    { valor: 1, label: 'Seg' },
    { valor: 2, label: 'Ter' },
    { valor: 3, label: 'Qua' },
    { valor: 4, label: 'Qui' },
    { valor: 5, label: 'Sex' },
    { valor: 6, label: 'Sáb' },
    { valor: 0, label: 'Dom' },
  ];

  // Formulário
  nomeInput = signal('');
  statusSelecionados = signal<string[]>(['Falta']);
  empresaIdInput = signal<number | null>(null);
  localIdInput = signal<number | null>(null);
  diasSelecionados = signal<number[]>([1, 2, 3, 4, 5, 6]);
  horaInput = signal('09:00');
  diaReferenciaInput = signal(0);
  numerosInput = signal('');
  ativoInput = signal(1);

  async ngOnInit() {
    await Promise.all([this.carregar(), this.carregarOpcoes()]);
    await this.atualizarWhatsapp();
    this.waTimer = setInterval(() => {
      const wa = this.whatsapp();
      if (wa?.ready) {
        if (this.waTimer) clearInterval(this.waTimer);
        this.waTimer = null;
        return;
      }
      this.atualizarWhatsapp();
    }, 5000);
  }

  ngOnDestroy() {
    if (this.waTimer) clearInterval(this.waTimer);
  }

  async carregar() {
    this.isLoading.set(true);
    try {
      this.relatorios.set(await this.service.listar());
    } catch {
      this.toastService.error('Erro ao carregar relatórios agendados');
    } finally {
      this.isLoading.set(false);
    }
  }

  async carregarOpcoes() {
    try {
      const [locais, empresas] = await Promise.all([
        this.localService.listar(true),
        this.empresaService.listar(true),
      ]);
      this.locais.set(locais);
      this.empresas.set(empresas);
    } catch {
      this.toastService.error('Erro ao carregar locais e empresas');
    }
  }

  async atualizarWhatsapp() {
    try {
      this.whatsapp.set(await this.service.whatsappStatus());
    } catch {
      this.whatsapp.set(null);
    }
  }

  async conectarWhatsapp() {
    this.waLoading.set(true);
    try {
      this.whatsapp.set(await this.service.conectarWhatsapp());
    } catch {
      this.toastService.error('Erro ao conectar ao WhatsApp');
    } finally {
      this.waLoading.set(false);
    }
  }

  async desconectarWhatsapp() {
    this.waLoading.set(true);
    try {
      this.whatsapp.set(await this.service.desconectarWhatsapp());
      this.toastService.success('WhatsApp desconectado');
    } catch {
      this.toastService.error('Erro ao desconectar do WhatsApp');
    } finally {
      this.waLoading.set(false);
    }
  }

  // ── Formulário ───────────────────────────────────────────────────────────

  abrirCriar() {
    this.selected.set(null);
    this.modalMode.set('create');
    this.nomeInput.set('');
    this.statusSelecionados.set(['Falta']);
    this.empresaIdInput.set(null);
    this.localIdInput.set(null);
    this.diasSelecionados.set([1, 2, 3, 4, 5, 6]);
    this.horaInput.set('09:00');
    this.diaReferenciaInput.set(0);
    this.numerosInput.set('');
    this.ativoInput.set(1);
    this.showModal.set(true);
  }

  abrirEditar(r: RelatorioAgendado) {
    this.selected.set(r);
    this.modalMode.set('edit');
    this.nomeInput.set(r.nome);
    this.statusSelecionados.set([...(r.status || [])]);
    this.empresaIdInput.set(r.empresa_id ?? null);
    this.localIdInput.set(r.local_id ?? null);
    this.diasSelecionados.set([...(r.dias_semana || [])]);
    this.horaInput.set(r.hora);
    this.diaReferenciaInput.set(r.dia_referencia || 0);
    this.numerosInput.set((r.numeros || []).join(', '));
    this.ativoInput.set(r.ativo);
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  toggleStatus(status: string) {
    const atual = this.statusSelecionados();
    this.statusSelecionados.set(
      atual.includes(status) ? atual.filter((s) => s !== status) : [...atual, status]
    );
  }

  toggleDia(dia: number) {
    const atual = this.diasSelecionados();
    this.diasSelecionados.set(
      atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia]
    );
  }

  parseNumeros(): string[] {
    return this.numerosInput()
      .split(/[\s,;]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  }

  async handleSave() {
    if (!this.nomeInput().trim()) {
      this.toastService.warning('Informe um nome para o relatório');
      return;
    }
    if (this.statusSelecionados().length === 0) {
      this.toastService.warning('Selecione ao menos um status');
      return;
    }
    if (this.diasSelecionados().length === 0) {
      this.toastService.warning('Selecione ao menos um dia da semana');
      return;
    }
    if (this.parseNumeros().length === 0) {
      this.toastService.warning('Informe ao menos um número de WhatsApp');
      return;
    }

    const empresa = this.empresas().find((e) => e.id === this.empresaIdInput());
    const local = this.locais().find((l) => l.id === this.localIdInput());

    const payload: RelatorioAgendadoPayload = {
      nome: this.nomeInput().trim(),
      status: this.statusSelecionados(),
      empresa_id: this.empresaIdInput(),
      empresa_nome: empresa?.nome ?? null,
      local_id: this.localIdInput(),
      local_nome: local?.nome ?? null,
      dias_semana: this.diasSelecionados(),
      hora: this.horaInput(),
      dia_referencia: this.diaReferenciaInput(),
      numeros: this.parseNumeros(),
      ativo: this.ativoInput(),
    };

    this.isSaving.set(true);
    try {
      if (this.modalMode() === 'create') {
        await this.service.criar({ ...payload, criado_por: this.authService._userName() || 'Sistema' } as RelatorioAgendadoPayload);
        this.toastService.success('Relatório agendado criado!');
      } else {
        await this.service.atualizar(this.selected()!.id, payload);
        this.toastService.success('Relatório agendado atualizado!');
      }
      this.showModal.set(false);
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao salvar relatório agendado');
    } finally {
      this.isSaving.set(false);
    }
  }

  async toggleAtivo(r: RelatorioAgendado) {
    try {
      await this.service.atualizar(r.id, {
        nome: r.nome,
        status: r.status,
        empresa_id: r.empresa_id,
        empresa_nome: r.empresa_nome,
        local_id: r.local_id,
        local_nome: r.local_nome,
        dias_semana: r.dias_semana,
        hora: r.hora,
        dia_referencia: r.dia_referencia,
        numeros: r.numeros,
        ativo: r.ativo ? 0 : 1,
      });
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao alterar status do relatório');
    }
  }

  async remover(r: RelatorioAgendado) {
    if (!confirm(`Remover o relatório "${r.nome}"?`)) return;
    try {
      await this.service.remover(r.id);
      this.toastService.success('Relatório removido');
      await this.carregar();
    } catch {
      this.toastService.error('Erro ao remover relatório');
    }
  }

  async testar(r: RelatorioAgendado) {
    if (!this.whatsapp()?.ready) {
      this.toastService.warning('Conecte o WhatsApp antes de testar o envio');
      return;
    }
    this.toastService.info(`Enviando teste de "${r.nome}"...`);
    try {
      const result = await this.service.testar(r.id);
      if (Array.isArray(result.envio) && result.envio.every((e) => e.success)) {
        this.toastService.success(`Teste enviado! ${result.total} item(ns) no relatório`);
      } else {
        const erro = Array.isArray(result.envio)
          ? result.envio.find((e) => !e.success)?.error
          : result.envio?.error;
        this.toastService.error(`Falha no envio: ${erro || 'verifique a conexão do WhatsApp'}`);
      }
    } catch {
      this.toastService.error('Erro ao testar relatório');
    }
  }

  // ── Helpers de exibição ───────────────────────────────────────────────────

  diasFormatados(dias: number[]): string {
    const labels: Record<number, string> = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };
    return [...(dias || [])].sort((a, b) => a - b).map((d) => labels[d] ?? d).join(', ');
  }

  statusResumo(status: string[]): string {
    if (!status || status.length === 0) return 'Todos';
    return status.join(', ');
  }

  diaReferenciaLabel(valor: number): string {
    if (valor === 0) return 'No dia do envio';
    if (valor === 1) return 'Dia anterior';
    return `${valor} dias antes`;
  }
}
