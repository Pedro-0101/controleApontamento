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

interface HistoryTableDay {
  date: string;
  horasFormatadas: { hora: string; tipo: 'auto' | 'manual' }[];
  totalHoras: string;
  status: statusMarcacaoDia | string;
}

@Component({
  selector: 'app-modal-detalhes-marcacao',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
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
      await this.marcacaoService.saveManualMarcacao(this.record().matricula, isoDate, this.novoPontoHora());
      this.novoPontoHora.set('');
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

  getHistoryDays() {
    const history = this.employeeHistory();
    if (!history) return [];

    // Get last 7 days
    const today = new Date();
    const last7Days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split('T')[0]);
    }

    // Group data by date
    const dayMap = new Map<string, any>();

    // Initialize all days
    last7Days.forEach(dateKey => {
      dayMap.set(dateKey, {
        date: dateKey,
        marcacoes: [],
        pontosManuais: [],
        comentarios: []
      });
    });

    // Process automatic marcacoes
    history.marcacoes?.forEach((m: any) => {
      const date = new Date(m.DataMarcacao);
      const dateKey = date.toISOString().split('T')[0];
      if (dayMap.has(dateKey)) {
        dayMap.get(dateKey)?.marcacoes.push(m);
      }
    });

    // Process manual points
    history.pontosManuais?.forEach((p: any) => {
      if (dayMap.has(p.data)) {
        dayMap.get(p.data)?.pontosManuais.push(p);
      }
    });

    // Process comments
    history.comentarios?.forEach((c: any) => {
      if (dayMap.has(c.data)) {
        dayMap.get(c.data)?.comentarios.push(c);
      }
    });

    // Return only days that have data
    return Array.from(dayMap.values()).filter(day =>
      day.marcacoes.length > 0 || day.pontosManuais.length > 0 || day.comentarios.length > 0
    );
  }

  getHistoryTableData(): HistoryTableDay[] {
    const history = this.employeeHistory();
    if (!history) return [];

    // Agrupar por data
    const dayMap = new Map<string, any>();

    // Processar marcações automáticas
    history.marcacoes?.forEach((m: any) => {
      const date = new Date(m.DataMarcacao);
      const dateKey = date.toISOString().split('T')[0];

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, { date: dateKey, marcacoes: [] });
      }
      dayMap.get(dateKey)?.marcacoes.push({
        hora: DateHelper.getStringTime(new Date(m.DataMarcacao)),
        tipo: 'auto'
      });
    });

    // Processar pontos manuais
    history.pontosManuais?.forEach((p: any) => {
      if (!dayMap.has(p.data)) {
        dayMap.set(p.data, { date: p.data, marcacoes: [] });
      }
      dayMap.get(p.data)?.marcacoes.push({
        hora: p.hora,
        tipo: 'manual'
      });
    });

    // Calcular total e formatar
    return Array.from(dayMap.values()).map(day => {
      // Ordenar marcações por hora
      day.marcacoes.sort((a: any, b: any) => a.hora.localeCompare(b.hora));

      // Criar instância temporária de MarcacaoDia para calcular status e horas
      const tempMarcacaoDia = new MarcacaoDia(
        0,
        this.record().cpf,
        this.record().matricula,
        this.record().nome,
        day.date,
        day.marcacoes.map((m: any) => new Marcacao({
          dataMarcacao: new Date(`${day.date}T${m.hora}:00`),
          numSerieRelogio: m.tipo === 'manual' ? 'MANUAL' : 'AUTO'
        })),
        this.record().empresa
      );

      // Vincular evento se existir para este dia
      const history = this.employeeHistory();
      if (history && history.eventos) {
        const isoDate = day.date;
        const activeEvent = history.eventos.find((e: any) =>
          isoDate >= e.data_inicio && isoDate <= e.data_fim
        );
        if (activeEvent) {
          tempMarcacaoDia.evento = activeEvent.tipo_evento;
        }
      }

      return {
        date: day.date,
        horasFormatadas: day.marcacoes.map((m: any) => ({ hora: m.hora, tipo: m.tipo })),
        totalHoras: tempMarcacaoDia.getHorasTrabalhadas(),
        status: tempMarcacaoDia.getStatus()
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }
}
