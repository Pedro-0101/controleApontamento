import { Component, computed, EventEmitter, inject, input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';
import { Employee } from '../../models/employee/employee';
import { DateHelper } from '../../core/helpers/dateHelper';
import { TitleCaseCustomPipe } from '../pipes/title-case-custom.pipe';

type CalCell = null | {
  dia: number;
  data: string;       // DD/MM/YYYY
  md: MarcacaoDia | null;
  isToday: boolean;
  isFuturo: boolean;
  diaSemana: number;  // 0=Dom
};

@Component({
  selector: 'app-modal-perfil-colaborador',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TitleCaseCustomPipe],
  templateUrl: './modal-perfil-colaborador.html',
  styleUrl: './modal-perfil-colaborador.css',
})
export class ModalPerfilColaborador implements OnInit {
  private marcacaoService = inject(MarcacaoService);
  private employeeService = inject(EmployeeService);

  matricula = input.required<string>();
  nomeInicial = input<string>('');

  @Output() close = new EventEmitter<void>();

  protected employee = signal<Employee | null>(null);
  protected marcacoesMes = signal<MarcacaoDia[]>([]);
  protected isLoading = signal(true);

  private mes = signal(new Date().getMonth());
  private ano = signal(new Date().getFullYear());

  readonly MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  protected mesLabel = computed(() => `${this.MESES[this.mes()]} ${this.ano()}`);

  protected isMesAtual = computed(() => {
    const hoje = new Date();
    return this.mes() === hoje.getMonth() && this.ano() === hoje.getFullYear();
  });

  // ── Calendário ──────────────────────────────────────────────────────────

  protected diasDoMes = computed((): CalCell[] => {
    const mes = this.mes();
    const ano = this.ano();
    const marcacoes = this.marcacoesMes();

    const map = new Map<string, MarcacaoDia>();
    marcacoes.forEach(m => map.set(m.data, m));

    const firstDay = new Date(ano, mes, 1);
    const lastDay  = new Date(ano, mes + 1, 0);
    const hoje = new Date();
    const cells: CalCell[] = [];

    for (let i = 0; i < firstDay.getDay(); i++) cells.push(null);

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(ano, mes, d);
      const data = DateHelper.getStringDate(dateObj);
      const md = map.get(data) ?? null;
      const isToday = dateObj.toDateString() === hoje.toDateString();
      const isFuturo = dateObj > hoje && !isToday;
      cells.push({ dia: d, data, md, isToday, isFuturo, diaSemana: dateObj.getDay() });
    }
    return cells;
  });

  // ── Resumo ───────────────────────────────────────────────────────────────

  private trabSab = computed(() => (this.employee()?.trabalha_sabado ?? 1) === 1);

  protected diasUteis = computed(() => {
    const mes = this.mes();
    const ano = this.ano();
    const hoje = new Date();
    const totalDays = new Date(ano, mes + 1, 0).getDate();
    const trabSab = this.trabSab();
    let count = 0;
    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(ano, mes, d);
      if (dateObj > hoje) break;
      const dow = dateObj.getDay();
      if (dow === 0) continue;
      if (dow === 6 && !trabSab) continue;
      count++;
    }
    return count;
  });

  protected totalPresenca = computed(() =>
    this.marcacoesMes().filter(md => md.marcacoes.filter(m => !m.desconsiderado).length > 0).length
  );

  protected totalHoras = computed(() => this.fmtMin(
    this.marcacoesMes().reduce((acc, md) => acc + md.getWorkedMinutes(), 0)
  ));

  protected totalFaltas = computed(() =>
    this.marcacoesMes().filter(md => md.getStatus() === 'Falta').length
  );

  protected totalAtrasos = computed(() =>
    this.marcacoesMes().filter(md => (md.getHorasNormaisEExtras()?.atraso ?? 0) > 0).length
  );

  protected totalExtras = computed(() => this.fmtMin(
    this.marcacoesMes().reduce((acc, md) => acc + (md.getHorasNormaisEExtras()?.extras ?? 0), 0)
  ));

  // Dias com algum tipo de problema (falta, atraso, incompleto)
  protected diasInconsistentes = computed(() =>
    this.marcacoesMes().filter(md =>
      ['Falta', 'Atraso', 'Incompleto'].includes(md.getStatus())
    ).length
  );

  // Lista de dias úteis para a tabela abaixo do calendário
  protected listaDias = computed(() => {
    const trabSab = this.trabSab();
    return this.marcacoesMes().filter(md => {
      const d = DateHelper.fromStringDate(md.data);
      if (!d) return false;
      const dow = d.getDay();
      if (dow === 0) return false;
      if (dow === 6 && !trabSab) return false;
      return true;
    });
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async ngOnInit() {
    this.carregarEmployee();
    await this.carregarMes();
  }

  async carregarEmployee() {
    try {
      const emp = await this.employeeService.getEmployeeByMatricula(this.matricula());
      this.employee.set(emp);
    } catch {}
  }

  async carregarMes() {
    this.isLoading.set(true);
    try {
      const dataInicio = DateHelper.getStringDate(new Date(this.ano(), this.mes(), 1));
      const dataFim    = DateHelper.getStringDate(new Date(this.ano(), this.mes() + 1, 0));
      const result = await this.marcacaoService.getPerfilMensalFuncionario(
        this.matricula(), dataInicio, dataFim
      );
      this.marcacoesMes.set(result);
    } catch {
      this.marcacoesMes.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  mesAnterior() {
    if (this.mes() === 0) { this.mes.set(11); this.ano.update(a => a - 1); }
    else { this.mes.update(m => m - 1); }
    this.carregarMes();
  }

  proximoMes() {
    if (this.isMesAtual()) return;
    if (this.mes() === 11) { this.mes.set(0); this.ano.update(a => a + 1); }
    else { this.mes.update(m => m + 1); }
    this.carregarMes();
  }

  // ── Helpers de template ───────────────────────────────────────────────────

  getCellClass(cell: NonNullable<CalCell>): string {
    if (cell.isFuturo) return 'cal-futuro';
    if (!cell.md) return 'cal-sem-dado';
    const { md, diaSemana } = cell;
    const ativas = md.marcacoes.filter(m => !m.desconsiderado);

    if (diaSemana === 0) return ativas.length ? 'cal-ok' : 'cal-dom';
    if (diaSemana === 6 && !md.trabalhaSabado) return ativas.length ? 'cal-ok' : 'cal-dom';

    switch (md.getStatus()) {
      case 'Ok':           return 'cal-ok';
      case 'Em andamento': return 'cal-andamento';
      case 'Atraso':       return 'cal-atraso';
      case 'Falta':        return 'cal-falta';
      case 'Incompleto':   return 'cal-incompleto';
      default:             return 'cal-evento';
    }
  }

  getCellInfo(md: MarcacaoDia): string {
    const status = md.getStatus();
    if (status === 'Falta') return '✕';
    if (['Ferias','Atestado','Afastado','Folga','Feriado','Suspensao'].includes(status))
      return status.slice(0, 3).toUpperCase();
    const h = md.getHorasTrabalhadas();
    return h !== '--:--' ? h : '';
  }

  getStatusClass(md: MarcacaoDia): string {
    const s = md.getStatus().toLowerCase().replace(/ /g, '-');
    return `status-${s}`;
  }

  private fmtMin(min: number): string {
    const h = Math.floor(min / 60).toString().padStart(2, '0');
    const m = (min % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
