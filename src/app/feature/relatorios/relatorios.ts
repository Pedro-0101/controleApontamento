import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarcacaoApiService } from '../../core/services/marcacao-api/marcacao-api.service';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { RelogioService } from '../../core/services/relogio/relogio.service';
import { Marcacao } from '../../models/marcacao/marcacao';
import { Employee } from '../../models/employee/employee';
import { Relogio } from '../../models/relogio/relogio';
import { Pagination } from '../../shared/pagination/pagination';
import { MarcacaoDia } from '../../models/marcacaoDia/marcacao-dia';
import { DateHelper } from '../../core/helpers/dateHelper';
import { MarcacaoService } from '../../core/services/marcacao/marcacao.service';
import { MultiSelectDropdown } from '../../shared/multi-select-dropdown/multi-select-dropdown';
import { ToastService } from '../../core/services/toast/toast.service';
import { TitleCaseCustomPipe } from '../../shared/pipes/title-case-custom.pipe';
import { AdmUnitService } from '../../core/services/admUnits/adm-unit.service';
import { AdmUnit } from '../../models/admUnit/adm-unit';

type TipoRelatorio = 'espelho' | 'vr';

interface FuncParaPDF {
  matricula: string;
  nome: string;
  cargo: string;
  empresa: string;
  dias: MarcacaoDia[];
  fillColors?: [number, number, number][];
}

interface VRMotivo {
  tipo: 'menos_90_dias' | 'falta' | 'atestado' | 'atraso' | 'pontos_manuais';
  descricao: string;
}

interface VRResultado {
  matricula: string;
  nome: string;
  empresa: string;
  cargo: string;
  motivos: VRMotivo[];
}

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, Pagination, MultiSelectDropdown, TitleCaseCustomPipe],
  templateUrl: './relatorios.html',
  styleUrl: './relatorios.css'
})

export class Relatorios {
  private marcacaoApiService = inject(MarcacaoApiService);
  private employeeService = inject(EmployeeService);
  private relogioService = inject(RelogioService);
  private marcacaoService = inject(MarcacaoService);
  private toastService = inject(ToastService);
  private admUnitService = inject(AdmUnitService);

  // Form data
  dataInicio = signal('');
  dataFim = signal('');
  selectedEmployees = signal<string[]>([]);
  selectedCompanies = signal<string[]>([]);
  selectedLocations = signal<string[]>([]);
  selectedClock = signal('');

  // Options
  employees = signal<Employee[]>([]);
  companies = signal<string[]>([]);
  locations = signal<AdmUnit[]>([]);
  relogios = signal<Relogio[]>([]);

  // Report data
  marcacoes = signal<Marcacao[]>([]);
  marcacoesPorDia = signal<MarcacaoDia[]>([]);
  isLoading = signal(false);
  hasGenerated = signal(false);

  // Tipo de relatório
  tipoRelatorio = signal<TipoRelatorio>('espelho');
  maxPontosManualVR = signal(0);
  resultadosVR = signal<VRResultado[]>([]);

  // Pagination
  currentPage = signal(1);
  itemsPerPage = signal(25);

  async ngOnInit() {
    await this.loadInitialData();
    this.setDefaultDates();
  }

  async loadInitialData() {
    try {
      this.isLoading.set(true);
      const [emps, clocks, locs] = await Promise.all([
        this.employeeService.getAllEmployees(),
        this.relogioService.updateRelogios(),
        this.admUnitService.getUnits()
      ]);
      
      const activeEmps = emps.filter(e => e.ativo === 1);
      this.employees.set(activeEmps);
      this.relogios.set(clocks);
      this.locations.set(locs);

      // Extract unique locations directly from employees to ensure matching values
      const distinctLocations = [...new Set(activeEmps.map(e => e.local).filter(l => !!l))].sort();
      this.locations.set(locs.filter(l => distinctLocations.includes(l.descricao))); // keep locations that exist in employees

      const distinctCompanies = [...new Set(activeEmps.map(e => e.empresa).filter(c => !!c))].sort();
      this.companies.set(distinctCompanies);
    } catch (error) {
      console.error('Erro ao carregar dados iniciais:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Filtered employees based on selected companies and locations
  filteredEmployees = computed(() => {
    const selectedComp = this.selectedCompanies();
    const selectedLoc = this.selectedLocations();
    let emps = this.employees();
    
    if (selectedComp.length > 0) {
      emps = emps.filter((e: Employee) => selectedComp.includes(e.empresa));
    }
    
    if (selectedLoc.length > 0) {
      const normalizedLocs = selectedLoc.map(l => l.trim().toUpperCase());
      emps = emps.filter((e: Employee) => {
        const empLocal = (e.local || '').trim().toUpperCase();
        return normalizedLocs.includes(empLocal);
      });
    }
    
    return emps;
  });

  // Mock list of "Employees" to reuse multi-select for companies
  companyOptions = computed(() => {
    return this.companies().map(c => ({
      id: 0,
      nome: c,
      matricula: c,
      empresa: c,
      local: '',
      cargo: '',
      ativo: 1
    } as Employee));
  });

  // Mock list of "Employees" to reuse multi-select for locations
  locationOptions = computed(() => {
    const uniqueLocs = [...new Set(this.employees().map(e => (e.local || '').trim().toUpperCase()).filter(l => !!l))].sort();
    return uniqueLocs.map(l => ({
      id: 0,
      nome: l,
      matricula: l,
      empresa: '',
      local: l,
      cargo: '',
      ativo: 1
    } as Employee));
  });

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
    // Convert YYYY-MM-DD to DD/MM/YYYY
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  async gerarRelatorio() {
    if (!this.dataInicio() || !this.dataFim()) {
      this.toastService.warning('Por favor, informe data de início e fim.');
      return;
    }

    // Validate date range (max 31 days)
    const inicio = new Date(this.dataInicio());
    const fim = new Date(this.dataFim());
    const diffDays = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 31) {
      this.toastService.warning('O período máximo permitido é de 31 dias.');
      return;
    }

    if (diffDays < 0) {
      this.toastService.warning('A data de início deve ser anterior à data de fim.');
      return;
    }

    this.isLoading.set(true);
    this.currentPage.set(1);

    try {
      const dataInicioDDMMYYYY = this.formatDateToDDMMYYYY(this.dataInicio());

      // Ajuste: adicionar sempre um dia ao dataFim para garantir que o último dia seja incluído
      // Usar split para evitar problemas de timezone com new Date()
      const parts = this.dataFim().split('-');
      const dataFimObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      dataFimObj.setDate(dataFimObj.getDate() + 1);

      const dataFimDDMMYYYY = this.formatDateToDDMMYYYY(this.formatDateToInput(dataFimObj));

      let result: Marcacao[] = [];

      // Determine which scenario to use
      if (this.selectedEmployees().length > 0 && this.selectedClock()) {
        // Scenario 4: Employees + Clock — busca por relógio e filtra por funcionários no cliente
        const allByClock = await this.marcacaoApiService.getMarcacoesByRelogio(
          this.selectedClock(),
          dataInicioDDMMYYYY,
          dataFimDDMMYYYY
        );
        const selectedSet = new Set(this.selectedEmployees());
        result = allByClock.filter(m => selectedSet.has(m.matriculaFuncionario));
      } else if (this.selectedEmployees().length > 0) {
        // Scenario 3: Employees only — busca tudo e filtra por funcionários no cliente
        const allMarcacoes = await this.marcacaoApiService.getAllMarcacoes(
          dataInicioDDMMYYYY,
          dataFimDDMMYYYY
        );
        const selectedSet = new Set(this.selectedEmployees());
        result = allMarcacoes.filter(m => selectedSet.has(m.matriculaFuncionario));
      } else if (this.selectedClock()) {
        // Scenario 2: Clock only
        result = await this.marcacaoApiService.getMarcacoesByRelogio(
          this.selectedClock(),
          dataInicioDDMMYYYY,
          dataFimDDMMYYYY
        );
      } else {
        // Scenario 1: All
        result = await this.marcacaoApiService.getAllMarcacoes(
          dataInicioDDMMYYYY,
          dataFimDDMMYYYY
        );
      }

      this.marcacoes.set(result);

      // Format by day like main table
      // Format by day using the shared service logic
      // Determine target matriculas for optimization/filtering
      let targetMatriculas: string[] | undefined = undefined;
      if (this.selectedEmployees().length > 0) {
        targetMatriculas = this.selectedEmployees();
      } else if (this.selectedCompanies().length > 0) {
        targetMatriculas = this.filteredEmployees().map(e => e.matricula);
      }

      const marcacoesOrdenadas = result.sort((a, b) => a.cpf.localeCompare(b.cpf));

      // Use original end date for display/formatting so it doesn't show the extra day
      const originalDataFimDDMMYYYY = this.formatDateToDDMMYYYY(this.dataFim());

      const marcacoesPorDia = await this.marcacaoService.formatarMarcacoesPorDia(marcacoesOrdenadas, dataInicioDDMMYYYY, originalDataFimDDMMYYYY, targetMatriculas);

      this.marcacoesPorDia.set(marcacoesPorDia);
      if (this.tipoRelatorio() === 'vr') this.calcularNaoAptosVR();
      this.hasGenerated.set(true);
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      alert('Erro ao gerar relatório. Verifique sua conexão e tente novamente.');
    } finally {
      this.isLoading.set(false);
    }
  }

  limparFiltros() {
    this.selectedEmployees.set([]);
    this.selectedCompanies.set([]);
    this.selectedLocations.set([]);
    this.selectedClock.set('');
    this.setDefaultDates();
    this.marcacoes.set([]);
    this.marcacoesPorDia.set([]);
    this.resultadosVR.set([]);
    this.hasGenerated.set(false);
    this.currentPage.set(1);
  }

  onEmployeeSelectionChange(selected: string[]) {
    this.selectedEmployees.set(selected);
  }

  onCompanySelectionChange(selected: string[]) {
    this.selectedCompanies.set(selected);
    // Clear employees that are no longer in the filtered list
    const filteredMatriculas = this.filteredEmployees().map(e => e.matricula);
    this.selectedEmployees.update(current => current.filter(m => filteredMatriculas.includes(m)));
  }

  onLocationSelectionChange(selected: string[]) {
    this.selectedLocations.set(selected);
    // Clear employees that are no longer in the filtered list
    const filteredMatriculas = this.filteredEmployees().map(e => e.matricula);
    this.selectedEmployees.update(current => current.filter(m => filteredMatriculas.includes(m)));
  }

  // Pagination helpers
  get paginatedMarcacoes() {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    const end = start + this.itemsPerPage();
    return this.marcacoes().slice(start, end);
  }

  get paginatedMarcacoesPorDia() {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    const end = start + this.itemsPerPage();
    return this.marcacoesPorDia().slice(start, end);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onItemsPerPageChange(items: number) {
    this.itemsPerPage.set(items);
    this.currentPage.set(1);
  }

  formatDateTime(date: Date): string {
    return date.toLocaleString('pt-BR');
  }

  hasManualPoints(): boolean {
    return this.marcacoesPorDia().some(dia =>
      dia.marcacoes.some(m => m.numSerieRelogio === 'MANUAL')
    );
  }

  getTotalManualPoints(): number {
    return this.marcacoesPorDia().reduce((total, dia) => {
      const manualPointsInDay = dia.marcacoes.filter(m => m.numSerieRelogio === 'MANUAL').length;
      return total + manualPointsInDay;
    }, 0);
  }

  hasCancelledPoints(): boolean {
    return this.marcacoesPorDia().some(dia =>
      dia.marcacoes.some(m => m.desconsiderado)
    );
  }

  get totalFuncionariosAnalisados(): number {
    return new Set(this.marcacoesPorDia().map(d => d.matricula)).size;
  }

  // ── VR ────────────────────────────────────────────────────────────────────

  calcularNaoAptosVR(): void {
    const todos = this.marcacoesPorDia();
    const maxManual = this.maxPontosManualVR();
    const hoje = new Date();

    const porFuncionario = new Map<string, MarcacaoDia[]>();
    for (const dia of todos) {
      if (!porFuncionario.has(dia.matricula)) porFuncionario.set(dia.matricula, []);
      porFuncionario.get(dia.matricula)!.push(dia);
    }

    const resultados: VRResultado[] = [];

    for (const [matricula, dias] of porFuncionario) {
      const motivos: VRMotivo[] = [];
      const primeiro = dias[0];

      const emp = this.employees().find(e => e.matricula === matricula);

      // Regra 0: em período de experiência
      if (emp?.data_fim_experiencia) {
        const fimExp = new Date(emp.data_fim_experiencia + 'T23:59:59');
        if (hoje <= fimExp) {
          const [y, m, d] = emp.data_fim_experiencia.split('-');
          motivos.push({
            tipo: 'menos_90_dias',
            descricao: `Em período de experiência (até ${d}/${m}/${y})`
          });
        }
      }

      // Regra 1: menos de 90 dias de registro
      if (emp?.data_admissao) {
        const admissao = new Date(emp.data_admissao + 'T12:00:00');
        const diasReg = Math.floor((hoje.getTime() - admissao.getTime()) / 86400000);
        if (diasReg <= 90) {
          motivos.push({
            tipo: 'menos_90_dias',
            descricao: `Menos de 90 dias de registro (${diasReg} dia${diasReg !== 1 ? 's' : ''})`
          });
        }
      }

      for (const dia of dias) {
        const status = dia.getStatus();
        const ddmm = dia.getDataFormatada().substring(0, 5);

        // Regra 2: falta
        if (status === 'Falta' || status === 'Falta Confirmada') {
          motivos.push({
            tipo: 'falta',
            descricao: `${status === 'Falta Confirmada' ? 'Falta confirmada' : 'Falta'} dia ${ddmm}`
          });
        }

        // Regra 3: atestado
        if (status === 'Atestado') {
          motivos.push({ tipo: 'atestado', descricao: `Atestado dia ${ddmm}` });
        }

        // Regra 4: atraso confirmado > 10 min
        if (status === 'Atraso' || status === 'Atraso Confirmado') {
          const extras = dia.getHorasNormaisEExtras();
          const atrasoMin = extras?.atraso ?? 0;
          if (atrasoMin > 10) {
            const h = Math.floor(atrasoMin / 60);
            const m = atrasoMin % 60;
            const tempo = h > 0 ? `${h}h${String(m).padStart(2, '0')}min` : `${m}min`;
            motivos.push({
              tipo: 'atraso',
              descricao: `Atraso de ${tempo} dia ${ddmm}`
            });
          }
        }
      }

      // Regra 5: apontamentos manuais
      const totalManual = dias.reduce(
        (s, d) => s + d.marcacoes.filter(m => m.numSerieRelogio === 'MANUAL' && !m.desconsiderado).length, 0
      );
      if (totalManual > maxManual) {
        motivos.push({
          tipo: 'pontos_manuais',
          descricao: `${totalManual} apontamento${totalManual !== 1 ? 's' : ''} manual${totalManual !== 1 ? 'is' : ''} no período (máx: ${maxManual})`
        });
      }

      if (motivos.length > 0) {
        resultados.push({
          matricula,
          nome: primeiro.nome,
          empresa: primeiro.empresa || '',
          cargo: primeiro.cargo || '',
          motivos
        });
      }
    }

    resultados.sort((a, b) => a.nome.localeCompare(b.nome));
    this.resultadosVR.set(resultados);
  }

  private vrRows() {
    return this.resultadosVR().map(r => ({
      Matricula: r.matricula,
      Nome: r.nome,
      Empresa: r.empresa,
      Cargo: r.cargo,
      Motivos: r.motivos.map(m => m.descricao).join('; ')
    }));
  }

  exportarVRCSV(): void {
    const csv = this.convertToCSV(this.vrRows());
    this.downloadFile(csv, `relatorio-vr-${Date.now()}.csv`, 'text/csv');
  }

  async exportarVRExcel(): Promise<void> {
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(this.vrRows());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Não Aptos VR');
      XLSX.writeFile(wb, `relatorio-vr-${Date.now()}.xlsx`);
    } catch (e) {
      console.error('Erro ao exportar Excel VR:', e);
    }
  }

  async exportarVRPDF(): Promise<void> {
    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();

      doc.setFontSize(16);
      doc.text('Relatório — Não Aptos para VR', 14, 15);
      doc.setFontSize(10);
      doc.text(
        `Período: ${this.formatDateToDDMMYYYY(this.dataInicio())} a ${this.formatDateToDDMMYYYY(this.dataFim())}`,
        14, 23
      );
      doc.text(
        `Gerado em: ${new Date().toLocaleString('pt-BR')} — ${this.resultadosVR().length} funcionário(s) não apto(s)`,
        14, 29
      );

      const body = this.resultadosVR().map(r => [
        this.toTitleCase(r.nome),
        r.matricula,
        this.toTitleCase(r.empresa),
        r.motivos.map(m => m.descricao).join('\n')
      ]);

      autoTable(doc, {
        startY: 35,
        head: [['Nome', 'Matrícula', 'Empresa', 'Motivos']],
        body,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [220, 38, 38] },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 22 },
          2: { cellWidth: 35 },
          3: { cellWidth: 'auto' }
        }
      });

      doc.save(`relatorio-vr-${Date.now()}.pdf`);
    } catch (e) {
      console.error('Erro ao exportar PDF VR:', e);
    }
  }

  motivoClass(tipo: VRMotivo['tipo']): string {
    const map: Record<VRMotivo['tipo'], string> = {
      menos_90_dias: 'motivo-dias',
      falta:         'motivo-falta',
      atestado:      'motivo-atestado',
      atraso:        'motivo-atraso',
      pontos_manuais:'motivo-manual'
    };
    return map[tipo];
  }

  exportarCSV() {
    const data = this.prepareExportData();
    const csv = this.convertToCSV(data);

    const date = new Date().getDate();
    const time = new Date().getTime();

    this.downloadFile(csv, `relatorio-marcacoes-${date}-${time}.csv`, 'text/csv');
  }

  async exportarExcel() {
    try {
      const XLSX = await import('xlsx');
      const data = this.prepareExportData();

      const date = new Date().getDate();
      const time = new Date().getTime();

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Marcações');
      XLSX.writeFile(wb, `relatorio-marcacoes-${date}-${time}.xlsx`);
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      alert('Erro ao exportar Excel. Instale as dependências: npm install xlsx');
    }
  }

  async exportarPDF(): Promise<void> {
    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();

      const periodo = `${this.formatDateToDDMMYYYY(this.dataInicio())} a ${this.formatDateToDDMMYYYY(this.dataFim())}`;
      const geradoEm = new Date().toLocaleString('pt-BR');
      const funcionarios = this.buildFuncionariosParaPDF();

      this.pdfPaginaResumo(doc, autoTable, funcionarios, periodo, geradoEm);

      for (const func of funcionarios) {
        doc.addPage();
        this.pdfPaginaFuncionario(doc, autoTable, func, periodo);
      }

      doc.save(`relatorio-marcacoes-${Date.now()}.pdf`);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Erro ao exportar PDF.');
    }
  }

  private prepareExportData() {
    // Flatten data for CSV/Excel: One row per day per employee
    const flatData: any[] = [];

    // Sort by Employee Name, then Date
    const sortedData = [...this.marcacoesPorDia()].sort((a, b) => {
      const nameCompare = a.nome.localeCompare(b.nome);
      if (nameCompare !== 0) return nameCompare;

      const dateA = new Date(a.data);
      const dateB = new Date(b.data);
      return dateA.getTime() - dateB.getTime();
    });

    sortedData.forEach(dia => {
      flatData.push({
        Matricula: dia.matricula,
        Nome: dia.nome,
        Empresa: dia.empresa || 'Não encontrado',
        Cargo: dia.cargo || '',
        Local: dia.local || '',
        Data: dia.getDataFormatada(),
        DiaSemana: dia.getDiaSemana(),
        Marcacoes: dia.marcacoes.map(m => {
          let hora = this.formatHora(m.dataMarcacao);
          if (m.numSerieRelogio === 'MANUAL') hora = `${hora}*`;
          if (m.desconsiderado) hora = `[${hora}]`;
          return hora;
        }).join(', '),
        HorasTrabalhadas: dia.getHorasTrabalhadas(),
        Status: dia.getStatus()
      });
    });

    return flatData;
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes
          const escaped = String(value).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      )
    ];

    return csvRows.join('\n');
  }

  private toTitleCase(value: string): string {
    if (!value) return '';
    const exceptions = ['da', 'de', 'do', 'das', 'dos', 'e'];
    return value.toLowerCase().split(' ').map((word, i) => {
      if (i !== 0 && exceptions.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  private toSentenceCase(value: string): string {
    if (!value) return '';
    const lower = value.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  private downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  // ── PDF helpers ───────────────────────────────────────────────────────────

  private formatHora(date: Date): string {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  private buildFuncionariosParaPDF(): FuncParaPDF[] {
    const agrupado = this.marcacoesPorDia().reduce((acc, dia) => {
      if (!acc[dia.matricula]) {
        acc[dia.matricula] = { matricula: dia.matricula, nome: dia.nome, cargo: dia.cargo || '', empresa: dia.empresa || '', dias: [] };
      }
      acc[dia.matricula].dias.push(dia);
      return acc;
    }, {} as Record<string, FuncParaPDF>);

    return Object.values(agrupado)
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(f => ({ ...f, dias: [...f.dias].sort((a, b) => a.data.localeCompare(b.data)) }));
  }

  private pdfContarStatus(dias: MarcacaoDia[]) {
    const c = { ok: 0, corrigido: 0, incompleto: 0, falta: 0, faltaConfirmada: 0, atraso: 0, atrasoConfirmado: 0, ausencia: 0, outros: 0 };
    const ausencias = new Set(['Folga', 'Ferias', 'Férias', 'Afastado', 'Atestado', 'Suspensao', 'BH', 'BH do Atraso']);
    for (const dia of dias) {
      const s = dia.getStatus();
      if      (s === 'Ok')                c.ok++;
      else if (s === 'Corrigido')         c.corrigido++;
      else if (s === 'Incompleto')        c.incompleto++;
      else if (s === 'Falta')             c.falta++;
      else if (s === 'Falta Confirmada')  c.faltaConfirmada++;
      else if (s === 'Atraso')            c.atraso++;
      else if (s === 'Atraso Confirmado') c.atrasoConfirmado++;
      else if (ausencias.has(s))          c.ausencia++;
      else                                c.outros++;
    }
    return c;
  }

  private pdfStatusColor(status: string): { bg: [number, number, number]; text: [number, number, number] } | null {
    const mapa: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
      'Ok':                { bg: [209, 250, 229], text: [6,   95,  70]  },
      'Corrigido':         { bg: [209, 250, 229], text: [6,   95,  70]  },
      'Falta':             { bg: [254, 226, 226], text: [153, 27,  27]  },
      'Falta Confirmada':  { bg: [254, 226, 226], text: [153, 27,  27]  },
      'Atraso':            { bg: [254, 243, 199], text: [146, 64,  14]  },
      'Atraso Confirmado': { bg: [254, 243, 199], text: [146, 64,  14]  },
      'Incompleto':        { bg: [254, 243, 199], text: [146, 64,  14]  },
      'Pendente':          { bg: [243, 244, 246], text: [55,  65,  81]  },
      'Em andamento':      { bg: [219, 234, 254], text: [30,  64,  175] },
      'Folga':             { bg: [243, 244, 246], text: [55,  65,  81]  },
      'Ferias':            { bg: [219, 234, 254], text: [30,  64,  175] },
      'Férias':            { bg: [219, 234, 254], text: [30,  64,  175] },
      'Atestado':          { bg: [237, 233, 254], text: [91,  33,  182] },
      'Afastado':          { bg: [237, 233, 254], text: [91,  33,  182] },
      'BH':                { bg: [204, 251, 241], text: [15,  118, 110] },
      'BH do Atraso':      { bg: [204, 251, 241], text: [15,  118, 110] },
      'Suspensao':         { bg: [237, 233, 254], text: [91,  33,  182] },
    };
    return mapa[status] ?? null;
  }

  private pdfPaginaResumo(doc: any, autoTable: any, funcionarios: FuncParaPDF[], periodo: string, geradoEm: string): void {
    const COR_LARANJA: [number, number, number] = [249, 115, 22];
    const COR_CINZA: [number, number, number]   = [107, 114, 128];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Relatorio de Marcacoes', 14, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COR_CINZA[0], COR_CINZA[1], COR_CINZA[2]);
    doc.text(`Periodo: ${periodo}`, 14, 27);
    doc.text(`Gerado em: ${geradoEm}  |  ${funcionarios.length} funcionario(s)`, 14, 33);
    doc.setTextColor(0, 0, 0);

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(14, 38, 196, 38);

    const todos = funcionarios.flatMap(f => f.dias);
    const c = this.pdfContarStatus(todos);
    const totalPend = c.falta + c.atraso + c.incompleto;

    const statusRows: [string, number][] = [
      ['Funcionarios analisados',         funcionarios.length],
      ['Dias totais no periodo',           todos.length],
      ['Ok / Corrigido',                   c.ok + c.corrigido],
      ['Incompleto',                       c.incompleto],
      ['Atraso (sem confirmacao)',         c.atraso],
      ['Atraso Confirmado',               c.atrasoConfirmado],
      ['Falta (sem confirmacao)',          c.falta],
      ['Falta Confirmada',                c.faltaConfirmada],
      ['Folga / Ferias / Afastamento / BH', c.ausencia],
    ];

    autoTable(doc, {
      startY: 43,
      body: statusRows.map(([label, val]) => [label, String(val)]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: [2, 4] },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;
        const [label, val] = statusRows[data.row.index] ?? ['', 0];
        const isPending = (label.includes('Incompleto') || label.includes('sem confirmacao')) && val > 0;
        if (isPending) {
          data.cell.styles.textColor = [153, 27, 27];
          if (data.column.index === 1) data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // Pendências highlight block
    const summaryY = (doc as any).lastAutoTable.finalY + 8;
    const pendBg: [number, number, number]   = totalPend > 0 ? [254, 226, 226] : [209, 250, 229];
    const pendText: [number, number, number] = totalPend > 0 ? [153, 27,  27]  : [6, 95, 70];

    doc.setFillColor(pendBg[0], pendBg[1], pendBg[2]);
    doc.roundedRect(14, summaryY, 110, 15, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(pendText[0], pendText[1], pendText[2]);
    doc.text(`Pendencias: ${totalPend}`, 19, summaryY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const detalhe = `${c.falta} falta(s)  •  ${c.atraso} atraso(s)  •  ${c.incompleto} incompleto(s)`;
    doc.text(detalhe, 19, summaryY + 12);
    doc.setTextColor(0, 0, 0);

    if (totalPend === 0) return;

    const listY = summaryY + 24;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Funcionarios com Pendencias', 14, listY);

    const pendRows = funcionarios.flatMap(f => {
      const faltas      = f.dias.filter(d => d.getStatus() === 'Falta').length;
      const atrasos     = f.dias.filter(d => d.getStatus() === 'Atraso').length;
      const incompletos = f.dias.filter(d => d.getStatus() === 'Incompleto').length;
      if (faltas + atrasos + incompletos === 0) return [];
      const partes: string[] = [];
      if (faltas > 0)      partes.push(`${faltas} falta${faltas > 1 ? 's' : ''}`);
      if (atrasos > 0)     partes.push(`${atrasos} atraso${atrasos > 1 ? 's' : ''}`);
      if (incompletos > 0) partes.push(`${incompletos} incompleto${incompletos > 1 ? 's' : ''}`);
      return [[this.toTitleCase(f.nome), f.matricula, f.empresa ? this.toTitleCase(f.empresa) : '', partes.join(', ')]];
    });

    autoTable(doc, {
      startY: listY + 4,
      head: [['Nome', 'Matricula', 'Empresa', 'Pendencias']],
      body: pendRows,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: COR_LARANJA, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 22 },
        2: { cellWidth: 55 },
        3: { cellWidth: 'auto' }
      }
    });
  }

  private pdfPaginaFuncionario(doc: any, autoTable: any, func: FuncParaPDF, periodo: string): void {
    const COR_LARANJA: [number, number, number] = [249, 115, 22];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(this.toTitleCase(func.nome), 14, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    const metaLine = [`Matricula: ${func.matricula}`, ...(func.empresa ? [this.toTitleCase(func.empresa)] : []), ...(func.cargo ? [this.toSentenceCase(func.cargo)] : [])];
    doc.text(metaLine.join('  |  '), 14, 23);
    doc.text(`Periodo: ${periodo}`, 14, 29);
    doc.setTextColor(0, 0, 0);

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(14, 34, 196, 34);

    // Build row metadata — hora in HH:MM, flag manual and desconsiderado
    const rowsMeta = func.dias.map(dia => ({
      fillColor: [255, 255, 255] as [number, number, number],
      marcacoes: dia.marcacoes.map(m => ({
        hora: this.formatHora(m.dataMarcacao),
        manual: m.numSerieRelogio === 'MANUAL',
        desconsiderado: m.desconsiderado || false
      }))
    }));

    const tableBody = func.dias.map((dia, i) => [
      dia.getDataFormatada(),
      dia.getDiaSemana().substring(0, 3),
      rowsMeta[i].marcacoes.map(m => m.manual ? `${m.hora}*` : m.hora).join('  '),
      dia.getHorasTrabalhadas(),
      dia.getStatus()
    ]);

    autoTable(doc, {
      startY: 38,
      head: [['Data', 'Dia', 'Marcacoes', 'Horas', 'Status']],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: [3, 4] },
      headStyles: { fillColor: COR_LARANJA, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 251, 245] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 18 },
        2: { cellWidth: 90 },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 30, halign: 'center' }
      },
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;
        // Capture effective row fill for didDrawCell (column 0 is parsed first)
        if (data.column.index === 0 && rowsMeta[data.row.index]) {
          const fc = data.cell.styles.fillColor;
          rowsMeta[data.row.index].fillColor = Array.isArray(fc) ? fc as [number, number, number] : [255, 255, 255];
        }
        // Color-code Status column
        if (data.column.index === 4) {
          const cor = this.pdfStatusColor(data.cell.raw);
          if (cor) {
            data.cell.styles.fillColor = cor.bg;
            data.cell.styles.textColor = cor.text;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section !== 'body' || data.column.index !== 2) return;
        const meta = rowsMeta[data.row.index];
        if (!meta?.marcacoes.some(m => m.desconsiderado)) return;

        const cell = data.cell;
        const x = cell.x + cell.padding('left');
        const baseline = cell.y + cell.height / 2 + 1;

        // Clear cell interior with the row's fill color (preserves alternating pattern)
        const [fr, fg, fb] = meta.fillColor;
        doc.setFillColor(fr, fg, fb);
        doc.rect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1, 'F');

        // Redraw each punch: cancelled ones in gray with strikethrough
        doc.setFontSize(8);
        let curX = x;
        meta.marcacoes.forEach((m, idx) => {
          const label = m.manual ? `${m.hora}*` : m.hora;
          const sep = idx < meta.marcacoes.length - 1 ? '  ' : '';
          const gray = m.desconsiderado ? 170 : 0;

          doc.setTextColor(gray, gray, gray);
          doc.text(label, curX, baseline);

          if (m.desconsiderado) {
            const w = doc.getTextWidth(label);
            doc.setDrawColor(170, 170, 170);
            doc.setLineWidth(0.3);
            doc.line(curX, baseline - 1, curX + w, baseline - 1);
          }

          curX += doc.getTextWidth(label + sep);
        });

        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
      }
    });

    // Legend
    const finalY = (doc as any).lastAutoTable.finalY;
    const hasManual    = func.dias.some(d => d.marcacoes.some(m => m.numSerieRelogio === 'MANUAL' && !m.desconsiderado));
    const hasCancelled = func.dias.some(d => d.marcacoes.some(m => m.desconsiderado));

    if (hasManual || hasCancelled) {
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      let ly = finalY + 6;
      if (hasManual)    { doc.text('* Ponto inserido manualmente no sistema', 14, ly); ly += 4; }
      if (hasCancelled)   doc.text('Pontos em cinza riscados foram desconsiderados/cancelados', 14, ly);
      doc.setTextColor(0, 0, 0);
    }
  }


}
