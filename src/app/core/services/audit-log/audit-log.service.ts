import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface AuditLog {
  id: number;
  usuario: string;
  acao: 'CREATE' | 'UPDATE' | 'DELETE';
  tabela: string;
  registro_id: number;
  dados_antigos: any;
  dados_novos: any;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuditLogService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/audit-logs`;

  async getLogs(filters: { dataInicio?: string; dataFim?: string; usuario?: string[]; acao?: string }): Promise<AuditLog[]> {
    let params = new HttpParams();
    if (filters.dataInicio) params = params.set('dataInicio', filters.dataInicio);
    if (filters.dataFim) params = params.set('dataFim', filters.dataFim);

    if (filters.usuario && filters.usuario.length > 0) {
      filters.usuario.forEach(u => {
        params = params.append('usuario', u);
      });
    }
    if (filters.acao) params = params.set('acao', filters.acao);

    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; logs: any[] }>(this.apiUrl, { params })
      );

      if (response.success) {
        return response.logs.map(log => ({
          ...log,
          dados_antigos: log.dados_antigos ? JSON.parse(log.dados_antigos) : null,
          dados_novos: log.dados_novos ? JSON.parse(log.dados_novos) : null
        }));
      }
      return [];
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
  }
}
