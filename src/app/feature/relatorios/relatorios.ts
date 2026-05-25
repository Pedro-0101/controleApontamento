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

  async exportarPDF() {
    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF();

      const date = new Date().getDate();
      const time = new Date().getTime();

      // Agrupar por funcionário
      const dadosPorFuncionario = this.marcacoesPorDia().reduce((acc, curr) => {
        const key = curr.matricula;
        if (!acc[key]) {
          acc[key] = {
            matricula: curr.matricula,
            nome: curr.nome,
            cargo: curr.cargo || '',
            dias: []
          };
        }
        acc[key].dias.push(curr);
        return acc;
      }, {} as Record<string, { matricula: string, nome: string, cargo: string, dias: MarcacaoDia[] }>);

      const funcionariosOrdenados = Object.values(dadosPorFuncionario).sort((a, b) => a.nome.localeCompare(b.nome));

      let firstPage = true;

      funcionariosOrdenados.forEach((func) => {
        if (!firstPage) {
          doc.addPage();
        }
        firstPage = false;

        // Title
        doc.setFontSize(16);
        doc.text('Relatório de Marcações', 14, 15);

        // Subtitle with period and employee info
        doc.setFontSize(10);
        doc.text(
          `Período: ${this.formatDateToDDMMYYYY(this.dataInicio())} a ${this.formatDateToDDMMYYYY(this.dataFim())}`,
          14, 22
        );
        doc.text(`Funcionário: ${this.toTitleCase(func.nome)} (${func.matricula})`, 14, 28);
        if (func.cargo) {
          doc.text(`Cargo: ${this.toSentenceCase(func.cargo)}`, 14, 34);
        }

        // Ordenar dias por data
        const diasOrdenados = func.dias.sort((a, b) => {
          const dateA = new Date(a.data);
          const dateB = new Date(b.data);
          return dateA.getTime() - dateB.getTime();
        });

        // Build metadata for each row to track cancelled/manual points
        const rowsMeta = diasOrdenados.map(dia => ({
          marcacoes: dia.marcacoes.map(m => ({
            hora: this.formatDateTime(m.dataMarcacao).split(' ')[1],
            manual: m.numSerieRelogio === 'MANUAL',
            desconsiderado: m.desconsiderado || false
          }))
        }));

        // Table - plain text for Marcações column (will be overdrawn for cancelled)
        const tableData = diasOrdenados.map((dia, i) => [
          dia.getDataFormatada(),
          dia.getDiaSemana(),
          rowsMeta[i].marcacoes.map(m => {
            let h = m.hora;
            if (m.manual) h = `${h}*`;
            return h;
          }).join(', '),
          dia.getHorasTrabalhadas(),
          dia.getStatus()
        ]);

        autoTable(doc, {
          startY: func.cargo ? 40 : 35,
          head: [['Data', 'Dia', 'Marcações', 'Horas', 'Status']],
          body: tableData,
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [41, 128, 185] },
          didDrawCell: (data: any) => {
            // Only process body rows, column index 2 (Marcações)
            if (data.section !== 'body' || data.column.index !== 2) return;
            const meta = rowsMeta[data.row.index];
            if (!meta || !meta.marcacoes.some((m: any) => m.desconsiderado)) return;

            // Clear cell content area and redraw with strikethrough
            const cell = data.cell;
            const x = cell.x + cell.padding('left');
            const y = cell.y + cell.height / 2 + 1;

            // Clear the text area
            doc.setFillColor(255, 255, 255);
            doc.rect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1, 'F');

            // Redraw each hour individually
            doc.setFontSize(8);
            let currentX = x;
            meta.marcacoes.forEach((m: any, idx: number) => {
              let label = m.hora;
              if (m.manual) label = `${label}*`;
              const suffix = idx < meta.marcacoes.length - 1 ? ', ' : '';

              if (m.desconsiderado) {
                doc.setTextColor(170, 170, 170); // Gray
              } else {
                doc.setTextColor(0, 0, 0); // Black
              }

              doc.text(label, currentX, y);

              if (m.desconsiderado) {
                // Draw strikethrough line
                const textWidth = doc.getTextWidth(label);
                doc.setDrawColor(170, 170, 170);
                doc.setLineWidth(0.3);
                doc.line(currentX, y - 1, currentX + textWidth, y - 1);
              }

              currentX += doc.getTextWidth(label + suffix);
            });

            // Reset colors
            doc.setTextColor(0, 0, 0);
            doc.setDrawColor(0, 0, 0);
          }
        });

        // Legend for manual/cancelled points
        const hasManual = diasOrdenados.some(d => d.marcacoes.some(m => m.numSerieRelogio === 'MANUAL'));
        const hasCancelled = diasOrdenados.some(d => d.marcacoes.some(m => m.desconsiderado));

        if (hasManual || hasCancelled) {
          const finalY = (doc as any).lastAutoTable.finalY || (func.cargo ? 40 : 35);
          doc.setFontSize(8);
          let legendY = finalY + 10;
          if (hasManual) {
            doc.text('* Marcações com asterisco são pontos inseridos manualmente', 14, legendY);
            legendY += 5;
          }
          if (hasCancelled) {
            doc.text('Marcações riscadas são pontos desconsiderados/cancelados', 14, legendY);
          }
        }
      });

      doc.save(`relatorio-marcacoes-${date}-${time}.pdf`);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Erro ao exportar PDF. Instale as dependências: npm install jspdf jspdf-autotable');
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
          let hora = this.formatDateTime(m.dataMarcacao).split(' ')[1];
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


}
