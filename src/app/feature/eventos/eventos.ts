import {
  Component, OnInit, OnDestroy, signal, inject, computed,
  ElementRef, ViewChild, AfterViewInit, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { Employee } from '../../models/employee/employee';
import { MultiSelectDropdown } from '../../shared/multi-select-dropdown/multi-select-dropdown';

/* ── Event-type metadata ─────────────────────────────────────── */
export interface EventTypeMeta {
  id: string;
  label: string;
  cls: string;
  bdVar: string;
}

export const EVENT_TYPES: Record<string, EventTypeMeta> = {
  Ferias:    { id: 'Ferias',    label: 'Férias',                        cls: 'ferias',    bdVar: '--ferias-bd'    },
  Atestado:  { id: 'Atestado',  label: 'Atestado médico',               cls: 'atestado',  bdVar: '--atestado-bd'  },
  Afastado:  { id: 'Afastado',  label: 'Afastamento',                   cls: 'afastado',  bdVar: '--afastado-bd'  },
  Suspensao: { id: 'Suspensao', label: 'Suspensão',                     cls: 'suspensao', bdVar: '--suspensao-bd' },
  Feriado:   { id: 'Feriado',   label: 'Feriado',                       cls: 'feriado',   bdVar: '--feriado-bd'   },
  BH:        { id: 'BH',        label: 'Banco de Horas',                cls: 'bh',        bdVar: '--bh-bd'        },
};

export interface GanttBar {
  eventId: number;
  type: string;
  cls: string;
  left: number;
  width: number;
  label: string;
  durationDays: number;
  showDuration: boolean;
  overflowL: boolean;
  overflowR: boolean;
  raw: any;
}

export interface GanttRow {
  emp: Employee;
  avatarColor: number;
  initials: string;
  bars: GanttBar[];
}

export interface PopoverState {
  event: any;
  x: number;
  y: number;
}

@Component({
  selector: 'app-eventos',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, MultiSelectDropdown],
  templateUrl: './eventos.html',
  styleUrl: './eventos.css'
})
export class EventosComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('ganttScroll') ganttScrollRef!: ElementRef<HTMLElement>;

  private marcacaoService = inject(MarcacaoService);
  private employeeService = inject(EmployeeService);
  private toastService    = inject(ToastService);
  private authService     = inject(AuthService);

  events           = signal<any[]>([]);
  allEmployeesList = signal<Employee[]>([]);
  isLoading        = signal(false);
  isSaving         = signal(false);

  selectedCompanies = signal<string[]>([]);
  companies         = signal<string[]>([]);
  locais            = signal<string[]>([]);

  companyOptions = computed(() =>
    this.companies().map(c => ({
      id: 0, nome: c, matricula: c, empresa: c, local: '', cargo: '', ativo: 1
    } as Employee))
  );

  filteredEmployees = computed(() => {
    const sel = this.selectedCompanies();
    if (sel.length === 0) return this.allEmployeesList();
    return this.allEmployeesList().filter(e => sel.includes(e.empresa));
  });

  showForm   = signal(false);
  editingId  = signal<number | null>(null);
  viewMode   = signal<'table' | 'gantt'>('gantt');

  formData = { matriculas: [] as string[], dataInicio: '', dataFim: '', tipoEvento: '', detalhes: '' };

  statusPeriodo = MarcacaoService.getPeriodEvents();

  // ── Search / filter ──────────────────────────────────────────
  searchTerm       = signal('');
  filterEventType  = signal('');
  filterLocal      = signal('');
  filterDataInicio = signal('');
  filterDataFim    = signal('');

  sortColumn    = signal<string>('data_inicio');
  sortDirection = signal<'asc' | 'desc'>('desc');
  currentPage   = signal(1);
  itemsPerPage  = signal(10);

  // ── Gantt date window ─────────────────────────────────────────
  ganttYear  = signal(new Date().getFullYear());
  ganttMonth = signal(new Date().getMonth()); // 0-indexed

  dayWidth = 36; // px

  /** First day of the displayed month */
  ganttStartDate = computed(() => new Date(this.ganttYear(), this.ganttMonth(), 1));

  /**
   * Last day shown: whichever is later — end of month or last event end date —
   * but never more than 89 days after the start (90 days total).
   */
  ganttEndDate = computed(() => {
    const start      = this.ganttStartDate();
    const endOfMonth = new Date(this.ganttYear(), this.ganttMonth() + 1, 0);
    const cap        = new Date(start); cap.setDate(cap.getDate() + 89);

    let maxEnd = endOfMonth;
    for (const ev of this.enrichedEvents()) {
      const d = new Date(ev.data_fim + 'T00:00:00');
      if (d > maxEnd) maxEnd = d;
    }
    return maxEnd > cap ? cap : maxEnd;
  });

  /** Array of every Date in the visible range */
  ganttDays = computed((): Date[] => {
    const start = this.ganttStartDate();
    const end   = this.ganttEndDate();
    const days: Date[] = [];
    const cur = new Date(start);
    while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return days;
  });

  /** Grouped month labels for the header strip */
  ganttMonthStrips = computed(() => {
    const days = this.ganttDays();
    const w = this.dayWidth;
    const strips: { label: string; widthPx: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const d = days[i];
      const y = d.getFullYear(), m = d.getMonth();
      let count = 0;
      while (i < days.length && days[i].getFullYear() === y && days[i].getMonth() === m) {
        count++; i++;
      }
      strips.push({
        label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        widthPx: count * w,
      });
    }
    return strips;
  });

  ganttMonthLabel = computed(() =>
    new Date(this.ganttYear(), this.ganttMonth(), 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  );

  /** 0-based index of today in ganttDays, or null if today is outside the range */
  todayOffset = computed((): number | null => {
    const start = this.ganttStartDate();
    const end   = this.ganttEndDate();
    const now   = new Date(); now.setHours(0, 0, 0, 0);
    if (now < start || now > end) return null;
    return Math.round((now.getTime() - start.getTime()) / 86400000);
  });

  // ── Gantt interaction state ───────────────────────────────────
  hoverRow    = signal<string | null>(null);
  hoverCol    = signal<number | null>(null);
  popover     = signal<PopoverState | null>(null);
  selectedPerson = signal<string | null>(null);

  // Active type chips (all on by default)
  activeTypes   = signal<Set<string>>(new Set(Object.keys(EVENT_TYPES)));
  activeLocais  = signal<Set<string>>(new Set());

  readonly EVENT_TYPES   = EVENT_TYPES;
  readonly eventTypeList = Object.values(EVENT_TYPES);

  readonly skeletonGanttRows = [
    { i: 0, w: 180, ml: 0   },
    { i: 1, w: 120, ml: 36  },
    { i: 2, w: 200, ml: 72  },
    { i: 3, w:  90, ml: 0   },
    { i: 4, w: 150, ml: 36  },
    { i: 5, w:  80, ml: 108 },
    { i: 6, w: 160, ml: 0   },
  ];

  // ── Enriched / filtered events ────────────────────────────────
  enrichedEvents = computed(() => {
    const emps = this.allEmployeesList();
    return this.events().map(ev => {
      const emp = emps.find(e => e.matricula === String(ev.matricula_funcionario));
      return { ...ev, empresa: emp?.empresa ?? '', empObj: emp };
    });
  });

  filteredEventsList = computed(() => {
    let result = this.enrichedEvents();
    const term    = this.searchTerm().toLowerCase().trim();
    const type    = this.filterEventType();
    const local   = this.filterLocal();
    const dataIni = this.filterDataInicio();
    const dataFim = this.filterDataFim();

    if (term) {
      result = result.filter(e =>
        (e.nome_funcionario || '').toLowerCase().includes(term) ||
        String(e.matricula_funcionario || '').includes(term)
      );
    }
    if (type) result = result.filter(e => e.tipo_evento === type);
    if (local) result = result.filter(e => e.empObj?.local === local);
    if (dataIni || dataFim) {
      result = result.filter(e => {
        const ei = e.data_inicio, ef = e.data_fim;
        if (dataIni && dataFim) return ei <= dataFim && ef >= dataIni;
        if (dataIni) return ef >= dataIni;
        return ei <= dataFim;
      });
    }
    return result;
  });

  sortedEventsList = computed(() => {
    const data = [...this.filteredEventsList()];
    const col  = this.sortColumn();
    const dir  = this.sortDirection();
    return data.sort((a, b) => {
      let va = a[col], vb = b[col];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.sortedEventsList().length / this.itemsPerPage())));

  paginatedEvents = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return this.sortedEventsList().slice(start, start + this.itemsPerPage());
  });

  pagesArray = computed(() => {
    const total   = this.totalPages();
    const current = this.currentPage();
    const pages: (number | string)[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else if (current <= 3) {
      pages.push(1, 2, 3, 4, '...', total);
    } else if (current >= total - 2) {
      pages.push(1, '...', total - 3, total - 2, total - 1, total);
    } else {
      pages.push(1, '...', current - 1, current, current + 1, '...', total);
    }
    return pages;
  });

  // ── Gantt rows ────────────────────────────────────────────────
  ganttRows = computed((): GanttRow[] => {
    const rangeStart = this.ganttStartDate();
    const rangeEnd   = this.ganttEndDate();
    const w          = this.dayWidth;
    const activeSet  = this.activeTypes();
    const activeLoc  = this.activeLocais();

    const rangeStartStr = this.toDateStr(rangeStart);
    const rangeEndStr   = this.toDateStr(rangeEnd);

    // filter employees
    const compSel = this.selectedCompanies();
    let emps = this.allEmployeesList();
    if (compSel.length > 0) emps = emps.filter(e => compSel.includes(e.empresa));
    if (activeLoc.size > 0) emps = emps.filter(e => activeLoc.has(e.local));
    const term = this.searchTerm().toLowerCase().trim();
    if (term) emps = emps.filter(e => e.nome.toLowerCase().includes(term));

    // events that overlap the visible range and pass type filter
    const eventsInRange = this.enrichedEvents().filter(ev => {
      if (!activeSet.has(ev.tipo_evento)) return false;
      return ev.data_inicio <= rangeEndStr && ev.data_fim >= rangeStartStr;
    });

    const rows: GanttRow[] = [];
    let colorIdx = 0;

    emps.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach(emp => {
      const empEvents = eventsInRange.filter(ev => String(ev.matricula_funcionario) === emp.matricula);
      if (empEvents.length === 0) return;

      const bars: GanttBar[] = empEvents.map(ev => {
        const evStart = new Date(ev.data_inicio + 'T00:00:00');
        const evEnd   = new Date(ev.data_fim   + 'T00:00:00');

        const clampedStart = evStart < rangeStart ? rangeStart : evStart;
        const clampedEnd   = evEnd   > rangeEnd   ? rangeEnd   : evEnd;

        const overflowL = evStart < rangeStart;
        const overflowR = evEnd   > rangeEnd;

        // offset in days from range start (0-based)
        const startOff = Math.round((clampedStart.getTime() - rangeStart.getTime()) / 86400000);
        const endOff   = Math.round((clampedEnd.getTime()   - rangeStart.getTime()) / 86400000);

        const left  = startOff * w + 3;
        const width = (endOff - startOff + 1) * w - 6;

        const totalDays = Math.round((evEnd.getTime() - evStart.getTime()) / 86400000) + 1;
        const meta = EVENT_TYPES[ev.tipo_evento] ?? { cls: 'afastado', label: ev.tipo_evento };

        return {
          eventId: ev.id,
          type: ev.tipo_evento,
          cls: meta.cls,
          left,
          width,
          label: meta.label,
          durationDays: totalDays,
          showDuration: width > 90,
          overflowL,
          overflowR,
          raw: ev,
        };
      });

      rows.push({ emp, avatarColor: colorIdx % 10, initials: this.getInitials(emp.nome), bars });
      colorIdx++;
    });

    return rows;
  });

  // Stats for the side panel (events active today)
  ganttStats = computed(() => {
    const now   = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of this.ganttRows()) {
      for (const bar of row.bars) {
        const s = bar.raw.data_inicio, e = bar.raw.data_fim;
        if (s <= today && e >= today) {
          counts[bar.type] = (counts[bar.type] ?? 0) + 1;
          total++;
        }
      }
    }
    return { counts, total };
  });

  // Events for the selected person
  selectedPersonEvents = computed(() => {
    const pid = this.selectedPerson();
    if (!pid) return [];
    return this.enrichedEvents().filter(ev => String(ev.matricula_funcionario) === pid);
  });

  selectedPersonRow = computed(() => {
    const pid = this.selectedPerson();
    if (!pid) return null;
    return this.ganttRows().find(r => r.emp.matricula === pid) ?? null;
  });

  // Left position of the "Today" vertical line (center of today's column)
  todayLineLeft = computed(() => {
    const off = this.todayOffset();
    if (off === null) return null;
    return (off + 0.5) * this.dayWidth;
  });

  // Left position of the hover column dashed line
  hoverColLineLeft = computed(() => {
    const col = this.hoverCol();
    if (col == null) return null;
    return (col + 0.5) * this.dayWidth;
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  async ngOnInit() {
    const today = new Date();
    this.filterDataInicio.set(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
    this.filterDataFim.set(new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]);

    await Promise.all([this.loadEvents(), this.loadEmployees()]);
  }

  ngAfterViewInit() {
    // Scroll to today on initial render
    setTimeout(() => this.scrollToToday('instant'), 100);
  }

  ngOnDestroy() {}

  // ── Data loaders ─────────────────────────────────────────────
  async loadEvents() {
    this.isLoading.set(true);
    const results = await this.marcacaoService.getAllEvents();
    this.events.set(results);
    this.isLoading.set(false);
  }

  async loadEmployees() {
    try {
      const emps = await this.employeeService.getAllActiveEmployees();
      this.allEmployeesList.set(emps);
      const distinctComp = [...new Set(emps.map((e: Employee) => e.empresa).filter(Boolean))].sort() as string[];
      this.companies.set(distinctComp);

      const distinctLoc = [...new Set(emps.map((e: Employee) => e.local).filter(Boolean))].sort() as string[];
      this.locais.set(distinctLoc);
      this.activeLocais.set(new Set(distinctLoc));
    } catch (e) {
      console.error('Erro ao buscar funcionários:', e);
    }
  }

  // ── Filter helpers ───────────────────────────────────────────
  onFilterChange() { this.currentPage.set(1); }

  onCompanySelectionChange(selected: string[]) {
    this.selectedCompanies.set(selected);
    const valid = this.filteredEmployees().map(e => e.matricula);
    this.formData.matriculas = this.formData.matriculas.filter(m => valid.includes(m));
  }

  goToPage(page: number | string) {
    if (typeof page === 'number') this.currentPage.set(page);
  }

  onSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
  }

  nextPage()     { if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1); }
  previousPage() { if (this.currentPage() > 1) this.currentPage.update(p => p - 1); }

  // ── Gantt interactions ────────────────────────────────────────
  toggleType(id: string) {
    this.activeTypes.update(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  toggleLocal(local: string) {
    this.activeLocais.update(prev => {
      const next = new Set(prev);
      if (next.has(local)) next.delete(local); else next.add(local);
      return next;
    });
  }

  onRowEnter(matricula: string) { this.hoverRow.set(matricula); }
  onRowLeave()                  { this.hoverRow.set(null); }
  onCellEnter(day: number)      { this.hoverCol.set(day); }
  onCellLeave()                 { this.hoverCol.set(null); }

  onPersonClick(matricula: string) {
    this.selectedPerson.update(p => p === matricula ? null : matricula);
  }

  onBarClick(bar: GanttBar, event: MouseEvent) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.popover.set({ event: bar.raw, x: rect.left, y: rect.bottom + 8 });
  }

  closePopover() { this.popover.set(null); }

  showPopoverForEvent(ev: any, mouseEvent: MouseEvent) {
    mouseEvent.stopPropagation();
    const rect = (mouseEvent.currentTarget as HTMLElement).getBoundingClientRect();
    this.popover.set({ event: ev, x: rect.left, y: rect.bottom + 8 });
  }

  @HostListener('document:keydown.escape')
  onEsc() { this.popover.set(null); }

  @HostListener('document:click')
  onDocumentClick() { this.popover.set(null); }

  scrollToToday(behavior: ScrollBehavior = 'smooth') {
    const el  = this.ganttScrollRef?.nativeElement;
    const off = this.todayOffset();
    if (!el || off === null) return;
    const targetLeft = off * this.dayWidth - (el.clientWidth - 260) / 2 + this.dayWidth / 2;
    el.scrollTo({ left: Math.max(0, targetLeft), behavior });
  }

  prevMonth() {
    const m = this.ganttMonth();
    if (m === 0) { this.ganttYear.update(y => y - 1); this.ganttMonth.set(11); }
    else          { this.ganttMonth.update(v => v - 1); }
  }

  nextMonth() {
    const m = this.ganttMonth();
    if (m === 11) { this.ganttYear.update(y => y + 1); this.ganttMonth.set(0); }
    else           { this.ganttMonth.update(v => v + 1); }
  }

  goToCurrentMonth() {
    const now = new Date();
    this.ganttYear.set(now.getFullYear());
    this.ganttMonth.set(now.getMonth());
    setTimeout(() => this.scrollToToday(), 80);
  }

  // ── Form helpers ──────────────────────────────────────────────
  openAddForm() {
    this.editingId.set(null);
    this.selectedCompanies.set([]);
    this.formData = { matriculas: [], dataInicio: '', dataFim: '', tipoEvento: '', detalhes: '' };
    this.showForm.set(true);
  }

  editEvent(event: any) {
    this.editingId.set(event.id);
    this.selectedCompanies.set([]);
    this.formData = {
      matriculas: [event.matricula_funcionario],
      dataInicio: event.data_inicio,
      dataFim: event.data_fim,
      tipoEvento: event.tipo_evento,
      detalhes: event.detalhes || '',
    };
    this.showForm.set(true);
  }

  async saveEvent() {
    if (!this.formData.matriculas.length || !this.formData.dataInicio || !this.formData.dataFim || !this.formData.tipoEvento) {
      this.toastService.warning('Preencha todos os campos.');
      return;
    }
    if (this.formData.dataInicio > this.formData.dataFim) {
      this.toastService.warning('A data de término deve ser igual ou maior que a data de início.');
      return;
    }
    this.isSaving.set(true);
    try {
      if (this.editingId()) {
        await this.marcacaoService.updateEvent(this.editingId()!, this.formData.dataInicio, this.formData.dataFim, this.formData.tipoEvento, this.formData.detalhes);
        this.toastService.success('Evento atualizado!');
      } else {
        await Promise.all(this.formData.matriculas.map(m =>
          this.marcacaoService.saveEvent(m, this.formData.dataInicio, this.formData.dataFim, this.formData.tipoEvento, 'PERIODO', this.formData.detalhes)
        ));
        this.toastService.success(`${this.formData.matriculas.length} evento(s) lançado(s) com sucesso!`);
      }
      this.showForm.set(false);
      await this.loadEvents();
    } catch {
      this.toastService.error('Erro ao salvar evento.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteEvent(id: number) {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;
    try {
      await this.marcacaoService.deleteEvent(id);
      this.toastService.success('Evento excluído.');
      if (this.popover()?.event?.id === id) this.closePopover();
      await this.loadEvents();
    } catch {
      this.toastService.error('Erro ao excluir evento.');
    }
  }

  // ── Display helpers ───────────────────────────────────────────
  formatData(dateStr: string) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  getInitials(name: string): string {
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
  }

  getDayOfWeek(d: Date): string {
    return ['dom','seg','ter','qua','qui','sex','sáb'][d.getDay()];
  }

  isWeekend(d: Date): boolean {
    return d.getDay() === 0 || d.getDay() === 6;
  }

  isTodayDate(d: Date): boolean {
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  private toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  getBarBorderRadius(bar: GanttBar): string {
    const tl = bar.overflowL ? '2px' : '8px';
    const tr = bar.overflowR ? '2px' : '8px';
    const bl = bar.overflowL ? '2px' : '8px';
    const br = bar.overflowR ? '2px' : '8px';
    return `${tl} ${tr} ${br} ${bl}`;
  }

  getBdColor(typeId: string): string {
    const m = EVENT_TYPES[typeId];
    return m ? `var(${m.bdVar})` : '#888';
  }

  getCssVar(varName: string): string {
    return `var(${varName})`;
  }

  getDuration(startStr: string, endStr: string): number {
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date(endStr   + 'T00:00:00');
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  }

  getMonthName(): string {
    return new Date(this.ganttYear(), this.ganttMonth(), 1)
      .toLocaleDateString('pt-BR', { month: 'long' });
  }

  isCurrentMonth(): boolean {
    const now = new Date();
    return now.getFullYear() === this.ganttYear() && now.getMonth() === this.ganttMonth();
  }

  trackById(_: number, item: any) { return item?.id ?? _; }
  trackByDay(_: number, d: number) { return d; }
  trackByMat(_: number, r: GanttRow) { return r.emp.matricula; }
}
