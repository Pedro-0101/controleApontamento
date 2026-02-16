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

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, Pagination, MultiSelectDropdown],
  templateUrl: './relatorios.html',
  styleUrl: './relatorios.css'
})
export class Relatorios {
  private marcacaoApiService = inject(MarcacaoApiService);
  private employeeService = inject(EmployeeService);
  private relogioService = inject(RelogioService);
  private marcacaoService = inject(MarcacaoService);
  private toastService = inject(ToastService);

  // Form data
  dataInicio = signal('');
  dataFim = signal('');
  selectedEmployees = signal<string[]>([]);
  selectedCompanies = signal<string[]>([]);
  selectedClock = signal('');

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
      // Format by day using the shared service logic
      // Determine target matriculas for optimization/filtering
      let targetMatriculas: string[] | undefined = undefined;
      if (this.selectedEmployees().length > 0) {
        targetMatriculas = this.selectedEmployees();
      } else if (this.selectedCompanies().length > 0) {
        targetMatriculas = this.filteredEmployees().map(e => e.matricula);
      }

      const marcacoesOrdenadas = result.sort((a, b) => a.cpf.localeCompare(b.cpf));
      const marcacoesPorDia = await this.marcacaoService.formatarMarcacoesPorDia(marcacoesOrdenadas, dataInicioDDMMYYYY, dataFimDDMMYYYY, targetMatriculas);

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


}
