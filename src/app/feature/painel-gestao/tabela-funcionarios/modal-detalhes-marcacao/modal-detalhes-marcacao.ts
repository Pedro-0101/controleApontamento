import { Component, EventEmitter, Output, inject, input, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoDia, statusMarcacaoDia } from '../../../../models/marcacaoDia/marcacao-dia';
import { MarcacaoService } from '../../../../core/services/marcacao/marcacao.service';
import { DateHelper } from '../../../../core/helpers/dateHelper';
import { ComentarioMarcacao } from '../../../../models/comentarioMarcacao/comentario-marcacao';
import { ToastService } from '../../../../core/services/toast/toast.service';
import { Marcacao } from '../../../../models/marcacao/marcacao';
import { TitleCaseCustomPipe } from '../../../../shared/pipes/title-case-custom.pipe';

interface HistoryTableDay {
  date: string;
  horasFormatadas: { hora: string; tipo: 'auto' | 'manual'; desconsiderado?: boolean; isNextDay?: boolean }[];
  totalHoras: string;
  status: statusMarcacaoDia | string;
}

@Component({
  selector: 'app-modal-detalhes-marcacao',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, TitleCaseCustomPipe],
  templateUrl: './modal-detalhes-marcacao.html',
  styleUrl: './modal-detalhes-marcacao.css'
})
export class ModalDetalhesMarcacaoComponent implements OnInit {
  private marcacaoService = inject(MarcacaoService);
  private toastService = inject(ToastService);

  record = input.required<MarcacaoDia>();
  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  DateHelper = DateHelper;

  novoComentario = signal('');
  novoPontoHora = signal('');
  isSaving = signal(false);
  isLoadingHistory = signal(false);
  isLoadingInitial = signal(true);
  employeeHistory = signal<any>(null);

  novoStatusFixo = signal('');
  statusDisponiveis = MarcacaoService.getPossiveisStatus();
  statusFixos = MarcacaoService.getPossiveisStatusFixos();

  async ngOnInit() {
    this.isLoadingInitial.set(true);
    await this.loadEmployeeHistory();
    this.isLoadingInitial.set(false);
  }

  async loadEmployeeHistory() {
    this.isLoadingHistory.set(true);
    try {
      const history = await this.marcacaoService.getEmployeeHistory(this.record().matricula);
      this.employeeHistory.set(history);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      this.isLoadingHistory.set(false);
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

      // Recarregar comentários imediatamente
      await this.recarregarComentarios();

      this.updated.emit();
    } catch (error) {
      this.toastService.error('Erro ao salvar comentário.');
      console.error('Erro detalhado:', error);
    } finally {
      this.isSaving.set(false);
    }
  }

  async recarregarComentarios() {
    try {
      // Buscar comentários atualizados do backend
      const history = await this.marcacaoService.getEmployeeHistory(this.record().matricula);
      if (history && history.comentarios) {
        // Atualizar comentários do record com os novos dados
        const isoDate = DateHelper.toIsoDate(this.record().data);
        const comentariosHoje = history.comentarios
          .filter((c: any) => c.data === isoDate)
          .map((c: any) => new ComentarioMarcacao(
            c.comentario,
            c.criado_por || 'Sistema',
            c.criado_em
          ));
        this.record().comentarios = comentariosHoje;
      }
    } catch (error) {
      console.error('Erro ao recarregar comentários:', error);
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
    console.log('Deleting manual point with ID:', pontoId);
    try {
      await this.marcacaoService.deletePontoManual(pontoId);
      await this.loadEmployeeHistory();
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
      await this.loadEmployeeHistory();
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
      await this.loadEmployeeHistory();
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
      await this.loadEmployeeHistory();
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

  getComentarios(): ComentarioMarcacao[] {
    return this.record().comentarios || [];
  }

  formatHora(date: Date) {
    return DateHelper.getStringTime(date);
  }

  getTotalHoras(): string {
    const total = this.record().getHorasTrabalhadas();
    return total || '--:--';
  }

  formatHistoryDate(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  getHistoryTableData(): HistoryTableDay[] {
    const matricula = this.record().matricula;
    const dataAtualIso = DateHelper.toIsoDate(this.record().data);

    // 1. Pegar todos os dias da memória pre carregada
    const allDays = this.marcacaoService._marcacoesFiltradasBackup()
      .filter(m => String(m.matricula).trim() === String(matricula).trim())
      .sort((a, b) => DateHelper.toIsoDate(a.data).localeCompare(DateHelper.toIsoDate(b.data)));

    // 2. Encontrar o índice do dia atual
    const currentIndex = allDays.findIndex(m => DateHelper.toIsoDate(m.data) === dataAtualIso);

    // 3. Pegar dia anterior e próximo (se existirem)
    const historyDays = [];
    if (currentIndex > 0) {
      historyDays.push(allDays[currentIndex - 1]); // Dia anterior
    }
    if (currentIndex !== -1 && currentIndex < allDays.length - 1) {
      historyDays.push(allDays[currentIndex + 1]); // Dia seguinte
    }

    // 4. Transformar em HistoryTableDay
    return historyDays.map(day => {
      const horasFormatadas = day.marcacoes.map(m => {
        return {
          hora: DateHelper.getStringTime(m.dataMarcacao),
          tipo: m.numSerieRelogio === 'MANUAL' ? 'manual' : 'auto',
          desconsiderado: m.desconsiderado,
          isNextDay: day.isDiaSeguinte(m)
        } as { hora: string; tipo: 'auto' | 'manual'; desconsiderado?: boolean; isNextDay?: boolean };
      });

      return {
        date: DateHelper.toIsoDate(day.data),
        horasFormatadas,
        totalHoras: day.getHorasTrabalhadas(),
        status: day.getStatus()
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }
}
