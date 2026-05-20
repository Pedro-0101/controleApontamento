import { Component, EventEmitter, Output, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoDia } from '../../../../models/marcacaoDia/marcacao-dia';
import { MarcacaoService } from '../../../../core/services/marcacao/marcacao.service';
import { DateHelper } from '../../../../core/helpers/dateHelper';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { Marcacao } from '../../../../models/marcacao/marcacao';
import { TitleCaseCustomPipe } from '../../../../shared/pipes/title-case-custom.pipe';
import { EmployeeService } from '../../../../core/services/employee/employee.service';
import { ModalPerfilColaborador } from '../../../../shared/modal-perfil-colaborador/modal-perfil-colaborador';

@Component({
  selector: 'app-modal-detalhes-marcacao',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, TitleCaseCustomPipe, ModalPerfilColaborador],
  templateUrl: './modal-detalhes-marcacao.html',
  styleUrl: './modal-detalhes-marcacao.css'
})
export class ModalDetalhesMarcacaoComponent {
  private marcacaoService = inject(MarcacaoService);
  private toastService = inject(ToastService);
  private employeeService = inject(EmployeeService);

  record = input.required<MarcacaoDia>();
  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  DateHelper = DateHelper;

  novoComentario = signal('');
  novoPontoHora = signal('');
  isSaving = signal(false);
  showPerfil = signal(false);

  novoStatusFixo = signal('');
  statusDisponiveis = MarcacaoService.getPossiveisStatus();
  statusFixos = MarcacaoService.getPossiveisStatusFixos();

  async desabilitarFuncionario() {
    if (!confirm(`Deseja realmente desabilitar o funcionário ${this.record().nome}?`)) return;

    this.isSaving.set(true);
    try {
      const employee = await this.employeeService.getEmployeeByMatricula(this.record().matricula);
      if (employee && employee.id) {
        await this.employeeService.updateEmployee(employee.id, {
          matricula: employee.matricula,
          nome: employee.nome,
          empresa: employee.empresa,
          local: employee.local,
          cargo: employee.cargo,
          trabalha_sabado: employee.trabalha_sabado,
          ativo: 0
        });
        this.toastService.success('Funcionário desabilitado com sucesso!');
        this.updated.emit();
        this.close.emit();
      } else {
        this.toastService.error('Funcionário não encontrado no banco de dados.');
      }
    } catch (error) {
      this.toastService.error('Erro ao desabilitar funcionário.');
      console.error(error);
    } finally {
      this.isSaving.set(false);
    }
  }

  async adicionarComentario() {
    if (!this.novoComentario().trim()) {
      this.toastService.warning('Digite um comentário.');
      return;
    }

    this.isSaving.set(true);
    try {
      const isoDate = DateHelper.toIsoDate(this.record().data);
      await this.marcacaoService.saveComment(this.record().matricula, isoDate, this.novoComentario());
      this.novoComentario.set('');
      this.toastService.success('Comentário salvo com sucesso!');
      this.updated.emit();
    } catch (error) {
      this.toastService.error('Erro ao salvar comentário.');
      console.error('Erro detalhado:', error);
    } finally {
      this.isSaving.set(false);
    }
  }

  async adicionarIntervaloPadrao() {
    const marcacoes = this.getMarcacoes();

    // Validar se já existem 4 ou mais pontos
    if (marcacoes.length >= 4) {
      this.toastService.warning('O funcionário já possui 4 ou mais pontos registrados. Não é possível inserir o intervalo padrão.');
      return;
    }

    // Validar se 12:00 ou 13:00 já existem
    const horasExistentes = marcacoes.map(m => this.formatHora(m.dataMarcacao));
    if (horasExistentes.includes('12:00') || horasExistentes.includes('13:00')) {
      this.toastService.warning('Já existe um ponto registrado às 12:00 ou 13:00. Verifique as marcações.');
      return;
    }

    this.isSaving.set(true);
    try {
      const isoDate = DateHelper.toIsoDate(this.record().data);
      await this.marcacaoService.saveStandardInterval(this.record().matricula, isoDate);
      
      if (this.record().evento !== 'Corrigido') {
        await this.marcacaoService.saveEvent(
          this.record().matricula,
          isoDate,
          isoDate,
          'Corrigido',
          'FIXO'
        );
      }

      this.toastService.success('Intervalo padrão inserido!');
      this.updated.emit();
    } catch (error) {
      this.toastService.error('Erro ao inserir intervalo padrão.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async adicionarPontoManual() {
    if (!this.novoPontoHora()) {
      this.toastService.warning('Informe a hora do ponto.');
      return;
    }

    this.isSaving.set(true);
    try {
      const isoDate = DateHelper.toIsoDate(this.record().data);
      
      let eventDate = isoDate;
      const [hours] = this.novoPontoHora().split(':').map(Number);
      if (hours < 5) {
        const parts = isoDate.split('-');
        const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        dateObj.setDate(dateObj.getDate() - 1);
        const day = dateObj.getDate().toString().padStart(2, '0');
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const year = dateObj.getFullYear();
        eventDate = `${year}-${month}-${day}`;
      }

      await this.marcacaoService.saveManualMarcacao(this.record().matricula, isoDate, this.novoPontoHora());
      this.novoPontoHora.set('');
      
      if (this.record().evento !== 'Corrigido') {
        await this.marcacaoService.saveEvent(
          this.record().matricula,
          eventDate,
          eventDate,
          'Corrigido',
          'FIXO'
        );
      }

      this.updated.emit();
    } catch (error) {
      this.toastService.error('Erro ao adicionar ponto manual. Verifique se este horário já não existe.');
      console.error('Erro detalhado:', error);
    } finally {
      this.isSaving.set(false);
    }
  }

  async deletarPontoManual(pontoId: number) {
    if (!confirm('Deseja realmente deletar este ponto manual?')) return;

    this.isSaving.set(true);
    try {
      await this.marcacaoService.deletePontoManual(pontoId);
      this.updated.emit();
      this.toastService.success('Ponto deletado!');
    } catch (error) {
      this.toastService.error('Erro ao deletar ponto.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async editarPontoManual(pontoId: number, horaAtual: string) {
    const novaHora = prompt('Nova hora (HH:MM):', horaAtual);
    if (!novaHora || novaHora === horaAtual) return;

    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(novaHora)) {
      this.toastService.error('Formato inválido. Use HH:MM');
      return;
    }

    this.isSaving.set(true);
    try {
      await this.marcacaoService.updatePontoManual(pontoId, novaHora);
      this.updated.emit();
      this.toastService.success('Ponto atualizado!');
    } catch (error) {
      this.toastService.error('Erro ao editar ponto.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async toggleDesconsiderar(m: Marcacao) {
    this.isSaving.set(true);
    try {
      const novaSituacao = !m.desconsiderado;
      await this.marcacaoService.toggleDesconsiderarStatus(
        m,
        this.record().matricula,
        this.record().data,
        novaSituacao
      );
      this.updated.emit();
      this.toastService.success(novaSituacao ? 'Ponto desconsiderado!' : 'Ponto reconsiderado!');
    } catch (error) {
      this.toastService.error('Erro ao alterar status do ponto.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async salvarStatusFixo() {
    if (!this.novoStatusFixo()) {
      this.toastService.warning('Selecione um status.');
      return;
    }

    this.isSaving.set(true);
    try {
      const isoDate = DateHelper.toIsoDate(this.record().data);
      await this.marcacaoService.saveEvent(
        this.record().matricula,
        isoDate,
        isoDate,
        this.novoStatusFixo(),
        'FIXO'
      );

      this.novoStatusFixo.set('');
      this.updated.emit();
      this.toastService.success('Status fixo aplicado!');
    } catch (error) {
      this.toastService.error('Erro ao salvar status fixo.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async removerStatusFixo(eventoId: number) {
    if (!confirm('Deseja realmente remover este status fixo?')) return;

    this.isSaving.set(true);
    try {
      await this.marcacaoService.deleteEvent(eventoId);
      this.updated.emit();
      this.toastService.success('Status removido!');
    } catch (error) {
      this.toastService.error('Erro ao remover status.');
    } finally {
      this.isSaving.set(false);
    }
  }


  getMarcacoes() {
    return this.record().marcacoes;
  }

  getComentarios() {
    return this.record().comentarios || [];
  }

  formatHora(date: Date) {
    return DateHelper.getStringTime(date);
  }

  getTotalHoras(): string {
    const total = this.record().getHorasTrabalhadas();
    return total || '--:--';
  }

}
