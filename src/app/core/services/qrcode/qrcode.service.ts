import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import { Employee } from '../../../models/employee/employee';

@Injectable({
  providedIn: 'root'
})
export class QRCodeService {

  private getLogoPath(company: string): string {
    const comp = company.toLowerCase();
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
      format: [85, 55] // Standard CR80 card size
    });

    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    // 1. Add Logo
    const logoUrl = this.getLogoPath(employee.empresa);
    try {
      const imgData = await this.getImageData(logoUrl);
      doc.addImage(imgData, 'JPEG', 5, 5, 45, 15);
    } catch (e) {
      console.error('Erro ao carregar logo:', e);
    }

    // 2. Generate and Add QR Code
    try {
      const qrDataUrl = await QRCode.toDataURL(employee.matricula, {
        margin: 1,
        width: 150
      });
      doc.addImage(qrDataUrl, 'PNG', (width - 35) / 2, 22, 35, 35);
    } catch (e) {
      console.error('Erro ao gerar QR Code:', e);
    }

    // 3. Add Employee Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(employee.nome, width / 2, 62, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Matrícula: ${employee.matricula}`, width / 2, 68, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(employee.empresa, width / 2, 73, { align: 'center' });

    // 4. Save/Download
    doc.save(`Cartao_${employee.matricula}.pdf`);
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
