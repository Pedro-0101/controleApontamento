import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { Employee } from '../../models/employee/employee';
import { QRCodeService } from '../../core/services/qrcode/qrcode.service';
import { TitleCaseCustomPipe } from '../pipes/title-case-custom.pipe';
import * as QRCode from 'qrcode';

interface CardData {
  employee: Employee;
  qrDataUrl: string;
  logoPath: string;
}

@Component({
  selector: 'app-modal-preview-qrcode',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TitleCaseCustomPipe],
  templateUrl: './modal-preview-qrcode.html',
  styleUrl: './modal-preview-qrcode.css'
})
export class ModalPreviewQrcode implements OnInit {
  @Input() employees: Employee[] = [];
  @Output() close = new EventEmitter<void>();

  private qrcodeService = inject(QRCodeService);

  cards = signal<CardData[]>([]);
  isLoading = signal(true);
  isDownloading = signal(false);

  async ngOnInit() {
    await this.buildCards();
  }

  private async buildCards() {
    this.isLoading.set(true);
    try {
      const cards: CardData[] = [];
      for (const emp of this.employees) {
        const qrDataUrl = await QRCode.toDataURL(emp.matricula || 'N/A', { margin: 1, width: 200 });
        cards.push({ employee: emp, qrDataUrl, logoPath: this.getLogoPath(emp.empresa) });
      }
      this.cards.set(cards);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getLogoPath(company: string): string {
    const c = company?.toLowerCase() ?? '';
    if (c.includes('dnp') && !c.includes('mix')) return '/images/DNP.jpeg';
    if (c.includes('pinhal')) return '/images/Pedreira Pinhal.jpeg';
    if (c.includes('sao joao') || c.includes('são joão')) return '/images/Pedreira Sao Joao.jpeg';
    return '/images/DNP Mix.jpeg';
  }

  async download() {
    this.isDownloading.set(true);
    try {
      if (this.employees.length === 1) {
        await this.qrcodeService.generateCardPDF(this.employees[0]);
      } else {
        await this.qrcodeService.generateBatchCardsPDF(this.employees);
      }
    } finally {
      this.isDownloading.set(false);
    }
  }

  print() {
    const cards = this.cards();

    const cardsHtml = cards.map(c => `
      <div class="qr-card">
        <img class="qr-logo" src="${c.logoPath}" onerror="this.style.visibility='hidden'">
        <img class="qr-code" src="${c.qrDataUrl}">
        <div class="qr-info">
          <div class="qr-name">${c.employee.nome.toUpperCase()}</div>
          <div class="qr-mat">Matrícula: ${c.employee.matricula}</div>
          <div class="qr-company">${c.employee.empresa.toUpperCase()}</div>
        </div>
      </div>
    `).join('');

    const printSection = document.createElement('div');
    printSection.id = 'qr-print-section';
    printSection.innerHTML = `<div class="qr-grid">${cardsHtml}</div>`;
    document.body.appendChild(printSection);

    const printStyle = document.createElement('style');
    printStyle.id = 'qr-print-style';
    printStyle.textContent = `
      @media print {
        body > *:not(#qr-print-section) { display: none !important; }
        #qr-print-section { display: block !important; }
        .qr-grid { display: flex; flex-wrap: wrap; gap: 10mm; padding: 15mm; }
        .qr-card { width: 55mm; height: 85mm; border: 0.3px solid #c8c8c8; display: flex; flex-direction: column; align-items: center; padding: 3mm 2.5mm 2mm; page-break-inside: avoid; }
        .qr-logo { width: 100%; height: 18mm; object-fit: contain; object-position: center; }
        .qr-code { width: 35mm; height: 35mm; margin-top: 4mm; }
        .qr-info { margin-top: 4mm; text-align: center; width: 100%; }
        .qr-name { font-size: 9px; font-weight: bold; text-transform: uppercase; line-height: 1.3; color: #000; word-break: break-word; }
        .qr-mat { font-size: 8px; color: #333; margin-top: 2px; }
        .qr-company { font-size: 7px; color: #666; text-transform: uppercase; margin-top: 2px; }
        @page { size: A4 portrait; margin: 0; }
      }
      #qr-print-section { display: none; }
    `;
    document.head.appendChild(printStyle);

    window.print();

    const cleanup = () => {
      document.getElementById('qr-print-section')?.remove();
      document.getElementById('qr-print-style')?.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 10000);
  }

  get title(): string {
    return this.employees.length === 1
      ? `Prévia do Cartão — ${this.employees[0].nome}`
      : `Prévia dos Cartões (${this.employees.length})`;
  }
}
