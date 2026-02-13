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
import { MultiSelectEmployees } from '../../shared/multi-select-employees/multi-select-employees';

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, Pagination, MultiSelectEmployees],
  templateUrl: './relatorios.html',
  styleUrl: './relatorios.css'
})
export class Relatorios {
  private marcacaoApiService = inject(MarcacaoApiService);
  private employeeService = inject(EmployeeService);
  private relogioService = inject(RelogioService);
  private marcacaoService = inject(MarcacaoService);

  // Form data
  dataInicio = signal('');
  dataFim = signal('');
  selectedEmployees = signal<string[]>([]);
  selectedCompanies = signal<string[]>([]);
  selectedClock = signal(''); // Keeping signal for possible legacy but focusing on companies

  // Options
  employees = signal<Employee[]>([]);
  companies = signal<string[]>([]);
  relogios = signal<Relogio[]>([]);

  // Report data
  marcacoes = signal<Marcacao[]>([]);
  marcacoesPorDia = signal<MarcacaoDia[]>([]);
  isLoading = signal(false);
  hasGenerated = signal(false);

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
      const [emps, clocks] = await Promise.all([
        this.employeeService.getAllEmployees(),
        this.relogioService.updateRelogios()
      ]);
      const activeEmps = emps.filter(e => e.ativo === 1);
      this.employees.set(activeEmps);
      this.relogios.set(clocks);

      const distinctCompanies = [...new Set(activeEmps.map(e => e.empresa).filter(c => !!c))].sort();
      this.companies.set(distinctCompanies);
    } catch (error) {
      console.error('Erro ao carregar dados iniciais:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Filtered employees based on selected companies
  filteredEmployees = computed(() => {
    const selected = this.selectedCompanies();
    if (selected.length === 0) return this.employees();
    return this.employees().filter((e: Employee) => selected.includes(e.empresa));
  });

  // Mock list of "Employees" to reuse multi-select for companies
  companyOptions = computed(() => {
    return this.companies().map(c => ({
      id: 0,
      nome: c,
      matricula: c,
      empresa: c,
      qrcod: '',
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
      alert('Por favor, informe data de início e fim.');
      return;
    }

    // Validate date range (max 31 days)
    const inicio = new Date(this.dataInicio());
    const fim = new Date(this.dataFim());
    const diffDays = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 31) {
      alert('O período máximo permitido é de 31 dias.');
      return;
    }

    if (diffDays < 0) {
      alert('A data de início deve ser anterior à data de fim.');
      return;
    }

    this.isLoading.set(true);
    this.currentPage.set(1);

    try {
      const dataInicioDDMMYYYY = this.formatDateToDDMMYYYY(this.dataInicio());
      const dataFimDDMMYYYY = this.formatDateToDDMMYYYY(this.dataFim());

      let result: Marcacao[] = [];

      // Determine which scenario to use
      if (this.selectedEmployees().length > 0 && this.selectedClock()) {
        // Scenario 4: Employees + Clock (multiple employees)
        const promises = this.selectedEmployees().map(matricula =>
          this.marcacaoApiService.getMarcacoesByEmployeeAndClock(
            matricula,
            this.selectedClock(),
            dataInicioDDMMYYYY,
            dataFimDDMMYYYY
          )
        );
        const results = await Promise.all(promises);
        result = results.flat();
      } else if (this.selectedEmployees().length > 0) {
        // Scenario 3: Employees only (multiple employees)
        const promises = this.selectedEmployees().map(matricula =>
          this.marcacaoApiService.getMarcacoesByEmployee(
            matricula,
            dataInicioDDMMYYYY,
            dataFimDDMMYYYY
          )
        );
        const results = await Promise.all(promises);
        result = results.flat();
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
      const marcacoesOrdenadas = result.sort((a, b) => a.cpf.localeCompare(b.cpf));
      const marcacoesPorDia = await this.formatarMarcacoesPorDia(marcacoesOrdenadas, dataInicioDDMMYYYY, dataFimDDMMYYYY);

      this.marcacoesPorDia.set(marcacoesPorDia);
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
    this.selectedClock.set('');
    this.setDefaultDates();
    this.marcacoes.set([]);
    this.marcacoesPorDia.set([]);
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

  exportarCSV() {
    const data = this.prepareExportData();
    const csv = this.convertToCSV(data);
    this.downloadFile(csv, 'relatorio-marcacoes.csv', 'text/csv');
  }

  async exportarExcel() {
    try {
      const XLSX = await import('xlsx');
      const data = this.prepareExportData();
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Marcações');
      XLSX.writeFile(wb, 'relatorio-marcacoes.xlsx');
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

      // Title
      doc.setFontSize(16);
      doc.text('Relatório de Marcações', 14, 15);

      // Subtitle with period
      doc.setFontSize(10);
      doc.text(
        `Período: ${this.formatDateToDDMMYYYY(this.dataInicio())} a ${this.formatDateToDDMMYYYY(this.dataFim())}`,
        14, 22
      );

      // Table
      const tableData = this.marcacoesPorDia().map(dia => [
        dia.matricula,
        dia.nome,
        dia.getDataFormatada(),
        dia.marcacoes.map((m, i) => {
          const hora = this.formatDateTime(m.dataMarcacao).split(' ')[1];
          return m.numSerieRelogio === 'MANUAL' ? `${hora}*` : hora;
        }).join(', '),
        dia.getHorasTrabalhadas(),
        dia.getStatus()
      ]);

      autoTable(doc, {
        startY: 28,
        head: [['Matrícula', 'Nome', 'Data', 'Marcações', 'Horas', 'Status']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] }
      });

      // Legend for manual points
      if (this.hasManualPoints()) {
        const finalY = (doc as any).lastAutoTable.finalY || 28;
        doc.setFontSize(8);
        doc.text('* Marcações com asterisco são pontos inseridos manualmente', 14, finalY + 10);
      }

      doc.save('relatorio-marcacoes.pdf');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Erro ao exportar PDF. Instale as dependências: npm install jspdf jspdf-autotable');
    }
  }

  private prepareExportData() {
    return this.marcacoesPorDia().map(dia => ({
      'Matrícula': dia.matricula,
      'Nome': dia.nome,
      'Data': dia.getDataFormatada(),
      'Marcações': dia.marcacoes.map((m, i) => {
        const hora = this.formatDateTime(m.dataMarcacao).split(' ')[1];
        return m.numSerieRelogio === 'MANUAL' ? `${hora}*` : hora;
      }).join(', '),
      'Horas Trabalhadas': dia.getHorasTrabalhadas(),
      'Status': dia.getStatus()
    }));
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

  private downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Format marcacoes by day - same logic as main table
   */
  private async formatarMarcacoesPorDia(marcacoes: Marcacao[], dataInicio: string, dataFim: string): Promise<MarcacaoDia[]> {
    if (marcacoes.length === 0) {
      return [];
    }

    // Group by employee (CPF) and date
    const grouped = new Map<string, Map<string, Marcacao[]>>();

    marcacoes.forEach(m => {
      const cpf = m.cpf;
      const dateKey = DateHelper.getStringDate(m.dataMarcacao);

      if (!grouped.has(cpf)) {
        grouped.set(cpf, new Map());
      }

      const employeeMap = grouped.get(cpf)!;
      if (!employeeMap.has(dateKey)) {
        employeeMap.set(dateKey, []);
      }

      employeeMap.get(dateKey)!.push(m);
    });

    // Convert to MarcacaoDia array
    const marcacoesDia: MarcacaoDia[] = [];

    // Fetch employee names for all unique matriculas
    const allMatriculas = [...new Set(marcacoes.map(m => m.matriculaFuncionario))];
    const employees = await this.employeeService.getEmployeeNamesBatch(allMatriculas);
    const nameMap = new Map<string, string>();
    employees.forEach(e => nameMap.set(e.matricula, e.nome));

    grouped.forEach((employeeMap, cpf) => {
      employeeMap.forEach((marcacoesArray, dateKey) => {
        const firstMarcacao = marcacoesArray[0];

        const marcacaoDia = new MarcacaoDia(
          firstMarcacao.id,
          cpf,
          firstMarcacao.matriculaFuncionario,
          nameMap.get(firstMarcacao.matriculaFuncionario) || '', // Attaching Name
          dateKey,
          marcacoesArray
        );

        marcacoesDia.push(marcacaoDia);
      });
    });

    // Fetch and add manual points
    try {
      const isoInicio = DateHelper.toIsoDate(dataInicio);
      const isoFim = DateHelper.toIsoDate(dataFim);
      const allMatriculas = [...new Set(marcacoes.map(m => m.matriculaFuncionario))];

      const manualPoints = await this.marcacaoService.fetchManualPointsBatch(
        allMatriculas, isoInicio, isoFim
      );

      // Map manual points to marcacoesDia
      const manualPointsMap = new Map<string, any[]>();
      manualPoints.forEach((p: any) => {
        const parts = p.data.split('-');
        if (parts.length === 3) {
          const dataFormatada = `${parts[2]}/${parts[1]}/${parts[0]}`;
          const key = `${String(p.matricula_funcionario).trim()}:${dataFormatada}`;
          if (!manualPointsMap.has(key)) manualPointsMap.set(key, []);
          manualPointsMap.get(key)?.push(p);
        }
      });

      // Add manual points to each day
      marcacoesDia.forEach(md => {
        const key = `${String(md.matricula).trim()}:${md.data}`;

        if (manualPointsMap.has(key)) {
          const points = manualPointsMap.get(key);
          points?.forEach(p => {
            const pDate = p.data.split('-');
            const pTime = p.hora.split(':');
            const dateObj = new Date(
              parseInt(pDate[0]),
              parseInt(pDate[1]) - 1,
              parseInt(pDate[2]),
              parseInt(pTime[0]),
              parseInt(pTime[1])
            );

            md.marcacoes.push(new Marcacao({
              id: p.id,
              dataMarcacao: dateObj,
              numSerieRelogio: 'MANUAL',
              tipoRegistro: 99,
              matriculaFuncionario: md.matricula,
              cpf: md.cpf
            }));
          });

          // Re-sort marcacoes by time
          md.marcacoes.sort((a, b) => a.dataMarcacao.getTime() - b.dataMarcacao.getTime());
        }
      });
    } catch (error) {
      console.error('Erro ao buscar pontos manuais:', error);
    }

    // Final sort: Date ASC, then Name ASC
    return marcacoesDia.sort((a, b) => {
      const dateCompare = a.data.localeCompare(b.data);
      if (dateCompare !== 0) return dateCompare;
      return a.nome.localeCompare(b.nome);
    });
  }
}
