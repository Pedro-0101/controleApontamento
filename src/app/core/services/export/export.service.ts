import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'print';

export interface ExportConfig {
  fields: string[];
  format: ExportFormat;
  fileName: string;
}

@Injectable({
  providedIn: 'root'
})
export class ExportService {

  constructor() { }

  export(data: MarcacaoDia[], config: ExportConfig) {
    const preparedData = this.prepareData(data, config.fields);

    switch (config.format) {
      case 'csv':
        this.exportToCSV(preparedData, config.fileName);
        break;
      case 'excel':
        this.exportToExcel(preparedData, config.fileName);
        break;
      case 'pdf':
        this.exportToPDF(preparedData, config.fields, config.fileName);
        break;
      case 'print':
        this.printTable(preparedData, config.fields);
        break;
    }
  }

  private prepareData(data: MarcacaoDia[], fields: string[]): any[] {
    return data.map(item => {
      const obj: any = {};
      fields.forEach(field => {
        switch (field) {
          case 'id': obj['ID'] = item.id; break;
          case 'matricula': obj['Matrícula'] = item.matricula; break;
          case 'nome': obj['Nome'] = item.nome; break;
          case 'data': obj['Data'] = item.getDataFormatada(); break;
          case 'diaSemana': obj['Dia Semana'] = item.getDiaSemana(); break;
          case 'marcacoes': obj['Marcações'] = item.getMarcacoesFormatadas(); break;
          case 'totalHoras': obj['Total Horas'] = item.getHorasTrabalhadas(); break;
          case 'status': obj['Status'] = item.getStatus(); break;
          case 'comentario': obj['Comentário'] = item.comentario || ''; break;
        }
      });
      return obj;
    });
  }

  private exportToCSV(data: any[], fileName: string) {
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.csv`;
    link.click();
  }

  private exportToExcel(data: any[], fileName: string) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marcações');
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  private exportToPDF(data: any[], fields: string[], fileName: string) {
    const doc = new jsPDF('l', 'mm', 'a4');
    const head = [Object.keys(data[0])];
    const body = data.map(obj => Object.values(obj));

    autoTable(doc, {
      head: head,
      body: body as any,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save(`${fileName}.pdf`);
  }

  private printTable(data: any[], fields: string[]) {
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => Object.values(obj));

    const html = `
      <html>
        <head>
          <title>Relatório de Marcações</title>
          <style>
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            h2 { text-align: center; }
          </style>
        </head>
        <body>
          <h2>Relatório de Marcações</h2>
          <table>
            <thead>
              <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow?.document.write(html);
    printWindow?.document.close();
  }
}
