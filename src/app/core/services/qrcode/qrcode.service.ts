import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import { Employee } from '../../../models/employee/employee';

@Injectable({
  providedIn: 'root'
})
export class QRCodeService {

  private getLogoPath(company: string): string {
    const comp = company ? company.toLowerCase() : '';
    if (comp.includes('dnp') && !comp.includes('mix')) {
      return '/images/DNP.jpeg';
    } else if (comp.includes('pinhal')) {
      return '/images/Pedreira Pinhal.jpeg';
    } else if (comp.includes('sao joao') || comp.includes('são joão')) {
      return '/images/Pedreira Sao Joao.jpeg';
    } else {
      return '/images/DNP Mix.jpeg';
    }
  }

  async generateCardPDF(employee: Employee): Promise<void> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    await this.drawCard(doc, employee, 10, 10);
    doc.save(`Cartao_${employee.matricula}.pdf`);
  }

  async generateBatchCardsPDF(employees: Employee[]): Promise<void> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const cardWidth = 55;
    const cardHeight = 85;
    const marginX = 15;
    const marginY = 15;
    const gapX = 10;
    const gapY = 10;

    let currentX = marginX;
    let currentY = marginY;
    let count = 0;

    for (const employee of employees) {
      if (count > 0 && count % 6 === 0) {
        doc.addPage();
        currentX = marginX;
        currentY = marginY;
      } else if (count > 0) {
        if (count % 2 === 0) {
          currentX = marginX;
          currentY += cardHeight + gapY;
        } else {
          currentX += cardWidth + gapX;
        }
      }

      await this.drawCard(doc, employee, currentX, currentY);
      count++;
    }

    doc.save(`Cartoes_Selecionados.pdf`);
  }

  private async drawCard(doc: jsPDF, employee: Employee, x: number, y: number): Promise<void> {
    const cardWidth = 55;
    const cardHeight = 85;

    // 0. Add Border (Thin gray border to help cutting)
    doc.setDrawColor(200);
    doc.setLineWidth(0.1);
    doc.rect(x, y, cardWidth, cardHeight);

    // 1. Add Logo
    const logoUrl = this.getLogoPath(employee.empresa);
    try {
      const imgData = await this.getImageData(logoUrl);
      // Adjust logo size to fit width well (90% of card width)
      doc.addImage(imgData, 'JPEG', x + 5, y + 5, cardWidth - 10, 18);
    } catch (e) {
      console.error('Erro ao carregar logo:', e);
    }

    // 2. Generate and Add QR Code
    try {
      const qrDataUrl = await QRCode.toDataURL(employee.matricula, {
        margin: 1,
        width: 150
      });
      doc.addImage(qrDataUrl, 'PNG', x + (cardWidth - 35) / 2, y + 25, 35, 35);
    } catch (e) {
      console.error('Erro ao gerar QR Code:', e);
    }

    // 3. Add Employee Info
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    // Wrap name if too long
    const nameLines = doc.splitTextToSize(employee.nome.toUpperCase(), cardWidth - 10);
    doc.text(nameLines, x + cardWidth / 2, y + 65, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const yMatricula = y + 65 + (nameLines.length * 4);
    doc.text(`Matrícula: ${employee.matricula}`, x + cardWidth / 2, yMatricula, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(employee.empresa.toUpperCase(), x + cardWidth / 2, yMatricula + 4, { align: 'center' });
  }

  private getImageData(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg'));
        } else {
          reject(new Error('Falha ao obter contexto 2D'));
        }
      };
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  }
}
