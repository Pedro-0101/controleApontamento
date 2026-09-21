import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  RelatorioAgendado,
  RelatorioAgendadoPayload,
  TesteRelatorioResult,
  WhatsappStatus,
} from '../../../models/relatorioAgendado/relatorio-agendado';

@Injectable({ providedIn: 'root' })
export class RelatorioAgendadoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/relatorios-agendados`;
  private waUrl = `${environment.apiUrlBackend}/whatsapp`;

  async listar(): Promise<RelatorioAgendado[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; relatorios: RelatorioAgendado[] }>(this.apiUrl)
    );
    return r.success ? r.relatorios : [];
  }

  async criar(payload: RelatorioAgendadoPayload): Promise<RelatorioAgendado> {
    const r = await firstValueFrom(
      this.http.post<{ success: boolean; relatorio: RelatorioAgendado }>(this.apiUrl, payload)
    );
    if (!r.success) throw new Error('Erro ao criar relatório agendado');
    return r.relatorio;
  }

  async atualizar(id: number, payload: RelatorioAgendadoPayload): Promise<RelatorioAgendado> {
    const r = await firstValueFrom(
      this.http.put<{ success: boolean; relatorio: RelatorioAgendado }>(`${this.apiUrl}/${id}`, payload)
    );
    if (!r.success) throw new Error('Erro ao atualizar relatório agendado');
    return r.relatorio;
  }

  async remover(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`));
  }

  async testar(id: number, numeros?: string[]): Promise<TesteRelatorioResult> {
    return firstValueFrom(
      this.http.post<TesteRelatorioResult>(`${this.apiUrl}/${id}/testar`, { numeros: numeros ?? [] })
    );
  }

  async whatsappStatus(): Promise<WhatsappStatus> {
    return firstValueFrom(this.http.get<WhatsappStatus & { success: boolean }>(`${this.waUrl}/status`));
  }

  async conectarWhatsapp(): Promise<WhatsappStatus> {
    return firstValueFrom(
      this.http.post<WhatsappStatus & { success: boolean }>(`${this.waUrl}/conectar`, {})
    );
  }

  async desconectarWhatsapp(): Promise<WhatsappStatus> {
    return firstValueFrom(
      this.http.post<WhatsappStatus & { success: boolean }>(`${this.waUrl}/desconectar`, {})
    );
  }
}
