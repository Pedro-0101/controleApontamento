import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoApiService } from '../../core/services/marcacao-api/marcacao-api.service';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { Marcacao } from '../../models/marcacao/marcacao';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';
import { Employee } from '../../models/employee/employee';
import { DateHelper } from '../../core/helpers/dateHelper';
import { Pagination } from '../../shared/pagination/pagination';
import { TitleCaseCustomPipe } from '../../shared/pipes/title-case-custom.pipe';
import { MultiSelectDropdown } from '../../shared/multi-select-dropdown/multi-select-dropdown';

export type StatusFalta = 'atencao' | 'alerta' | 'critico';

export interface FuncionarioFalta {
  matricula: string;
  nome: string;
  empresa: string;
  local: string;
  faltas: number;
}

@Component({
  selector: 'app-faltas',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, Pagination, MultiSelectDropdown, TitleCaseCustomPipe],
  templateUrl: './faltas.html',
  styleUrl: './faltas.css'
})
export class Faltas {
  private marcacaoApiService = inject(MarcacaoApiService);
  private marcacaoService = inject(MarcacaoService);
  private employeeService = inject(EmployeeService);
  private toastService = inject(ToastService);

  // Form data
  dataInicio = signal('');
  dataFim = signal('');
  selectedCompanies = signal<string[]>([]);
  selectedLocations = signal<string[]>([]);

  // Options
  employees = signal<Employee[]>([]);

  // Dashboard data
  marcacoesPorDia = signal<MarcacaoDia[]>([]);
  funcionariosFaltas = signal<FuncionarioFalta[]>([]);
  isLoading = signal(false);
  hasGenerated = signal(false);

  // Pagination
  currentPage = signal(1);
  itemsPerPage = signal(25);

  async ngOnInit() {
    await this.loadInitialData();
    this.setDefaultDates();
    await this.gerarDashboard();
  }

  async loadInitialData() {
    try {
      this.isLoading.set(true);
      const emps = await this.employeeService.getAllEmployees();
      this.employees.set(emps.filter(e => e.ativo === 1));
    } catch (error) {
      console.error('Erro ao carregar dados iniciais:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Options de filtro ────────────────────────────────────────────────────

  filteredEmployees = computed(() => {
    const selectedComp = this.selectedCompanies();
    const selectedLoc = this.selectedLocations();
    let emps = this.employees();

    if (selectedComp.length > 0) {
      emps = emps.filter(e => selectedComp.includes(e.empresa));
    }

    if (selectedLoc.length > 0) {
      const normalizedLocs = selectedLoc.map(l => l.trim().toUpperCase());
      emps = emps.filter(e => normalizedLocs.includes((e.local || '').trim().toUpperCase()));
    }

    return emps;
  });

  companyOptions = computed(() => {
    const distinct = [...new Set(this.employees().map(e => e.empresa).filter(c => !!c))].sort();
    return distinct.map(c => ({
      id: 0,
      nome: c,
      matricula: c,
      empresa: c,
      local: '',
      cargo: '',
      ativo: 1
    } as Employee));
  });

  locationOptions = computed(() => {
    const distinct = [...new Set(this.employees().map(e => (e.local || '').trim().toUpperCase()).filter(l => !!l))].sort();
    return distinct.map(l => ({
      id: 0,
      nome: l,
      matricula: l,
      empresa: '',
      local: l,
      cargo: '',
      ativo: 1
    } as Employee));
  });

  // ── Datas ────────────────────────────────────────────────────────────────

  setDefaultDates() {
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    this.dataFim.set(this.formatDateToInput(hoje));
    this.dataInicio.set(this.formatDateToInput(primeiroDiaMes));
  }

  formatDateToInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDateToDDMMYYYY(dateStr: string): string {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  // ── Handlers de filtro ───────────────────────────────────────────────────

  onCompanySelectionChange(selected: string[]) {
    this.selectedCompanies.set(selected);
  }

  onLocationSelectionChange(selected: string[]) {
    this.selectedLocations.set(selected);
  }

  limparFiltros() {
    this.selectedCompanies.set([]);
    this.selectedLocations.set([]);
    this.setDefaultDates();
    this.marcacoesPorDia.set([]);
    this.funcionariosFaltas.set([]);
    this.hasGenerated.set(false);
    this.currentPage.set(1);
  }

  // ── Geração do dashboard ─────────────────────────────────────────────────

  async gerarDashboard() {
    if (!this.dataInicio() || !this.dataFim()) {
      this.toastService.warning('Por favor, informe data de início e fim.');
      return;
    }

    const inicio = new Date(this.dataInicio());
    const fim = new Date(this.dataFim());
    const diffDays = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      this.toastService.warning('A data de início deve ser anterior à data de fim.');
      return;
    }

    this.isLoading.set(true);
    this.currentPage.set(1);

    try {
      const dataInicioDDMMYYYY = this.formatDateToDDMMYYYY(this.dataInicio());

      const parts = this.dataFim().split('-');
      const dataFimObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      dataFimObj.setDate(dataFimObj.getDate() + 1);
      const dataFimDDMMYYYY = this.formatDateToDDMMYYYY(this.formatDateToInput(dataFimObj));

      const marcacoes = await this.marcacaoApiService.getAllMarcacoes(dataInicioDDMMYYYY, dataFimDDMMYYYY);
      const marcacoesOrdenadas = marcacoes.sort((a, b) => a.cpf.localeCompare(b.cpf));

      const marcacoesPorDia = await this.marcacaoService.formatarMarcacoesPorDia(
        marcacoesOrdenadas,
        dataInicioDDMMYYYY,
        this.formatDateToDDMMYYYY(this.dataFim())
      );

      this.marcacoesPorDia.set(this.filtrarDias(marcacoesPorDia));
      this.calcularFaltas();
      this.hasGenerated.set(true);
    } catch (error) {
      console.error('Erro ao gerar dashboard de faltas:', error);
      this.toastService.error('Erro ao gerar o dashboard. Verifique sua conexão e tente novamente.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private filtrarDias(dias: MarcacaoDia[]): MarcacaoDia[] {
    const empresas = this.selectedCompanies();
    if (empresas.length > 0) {
      dias = dias.filter(d => d.empresa && empresas.includes(d.empresa));
    }

    const locais = this.selectedLocations();
    if (locais.length > 0) {
      const normalized = locais.map(l => l.trim().toUpperCase());
      dias = dias.filter(d => normalized.includes((d.local || '').trim().toUpperCase()));
    }

    return dias;
  }

  private isFaltaConfirmada(dia: MarcacaoDia, matricula: string): boolean {
    if (dia.getStatus() !== 'Falta Confirmada') return false;

    const emp = this.employees().find(e => e.matricula === matricula);
    if (emp?.data_admissao && DateHelper.toIsoDate(dia.data) < DateHelper.toIsoDate(emp.data_admissao)) {
      return false;
    }

    return true;
  }

  calcularFaltas(): void {
    const todos = this.marcacoesPorDia();
    const porFuncionario = new Map<string, MarcacaoDia[]>();

    for (const dia of todos) {
      if (!porFuncionario.has(dia.matricula)) porFuncionario.set(dia.matricula, []);
      porFuncionario.get(dia.matricula)!.push(dia);
    }

    const resultados: FuncionarioFalta[] = [];

    for (const [matricula, dias] of porFuncionario) {
      const quantidadeFaltas = dias.filter(dia => this.isFaltaConfirmada(dia, matricula)).length;
      if (quantidadeFaltas === 0) continue;

      const primeiro = dias[0];
      resultados.push({
        matricula,
        nome: primeiro.nome,
        empresa: primeiro.empresa || '',
        local: primeiro.local || '',
        faltas: quantidadeFaltas
      });
    }

    resultados.sort((a, b) => b.faltas - a.faltas || a.nome.localeCompare(b.nome));
    this.funcionariosFaltas.set(resultados);
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────

  readonly numeroFuncionariosComFalta = computed(() => this.funcionariosFaltas().length);

  readonly totalFaltas = computed(() =>
    this.funcionariosFaltas().reduce((total, f) => total + f.faltas, 0)
  );

  readonly maiorNumeroFaltas = computed(() => {
    const list = this.funcionariosFaltas();
    if (list.length === 0) return 0;
    return Math.max(...list.map(f => f.faltas));
  });

  readonly mediaFaltas = computed(() => {
    const total = this.totalFaltas();
    const count = this.numeroFuncionariosComFalta();
    if (count === 0) return 0;
    return total / count;
  });

  readonly empresaComMaisFalta = computed(() => {
    const map = new Map<string, number>();
    for (const f of this.funcionariosFaltas()) {
      const chave = f.empresa || 'Não informada';
      map.set(chave, (map.get(chave) || 0) + f.faltas);
    }

    let melhor: { nome: string; faltas: number } | null = null;
    for (const [nome, faltas] of map) {
      if (!melhor || faltas > melhor.faltas) melhor = { nome, faltas };
    }

    return melhor;
  });

  // ── Status ───────────────────────────────────────────────────────────────

  statusFalta(faltas: number): StatusFalta {
    if (faltas > 5) return 'critico';
    if (faltas >= 3) return 'alerta';
    return 'atencao';
  }

  statusLabel(status: StatusFalta): string {
    const map: Record<StatusFalta, string> = {
      atencao: 'Atenção',
      alerta: 'Alerta',
      critico: 'Crítico'
    };
    return map[status];
  }

  // ── Pagination ───────────────────────────────────────────────────────────

  get paginatedFuncionarios() {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    const end = start + this.itemsPerPage();
    return this.funcionariosFaltas().slice(start, end);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
  }
}