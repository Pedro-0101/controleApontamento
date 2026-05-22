import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface EmpresaConfig {
  id: number;
  nome: string;
  email: string;
  chave: string;
  ativo: number;
  criado_em?: string;
}

export interface EmpresaConfigForm {
  nome: string;
  email: string;
  senha: string;
  chave: string;
  ativo?: number;
}

@Injectable({ providedIn: 'root' })
export class EmpresaConfigService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/empresas-config`;

  async listar(): Promise<EmpresaConfig[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; empresas: EmpresaConfig[] }>(this.apiUrl)
    );
    return r.success ? r.empresas : [];
  }

  async criar(data: EmpresaConfigForm): Promise<EmpresaConfig> {
    const r = await firstValueFrom(
      this.http.post<{ success: boolean; empresa: EmpresaConfig }>(this.apiUrl, data)
    );
    if (!r.success) throw new Error('Erro ao criar empresa');
    return r.empresa;
  }

  async atualizar(id: number, data: EmpresaConfigForm): Promise<EmpresaConfig> {
    const r = await firstValueFrom(
      this.http.put<{ success: boolean; empresa: EmpresaConfig }>(`${this.apiUrl}/${id}`, data)
    );
    if (!r.success) throw new Error('Erro ao atualizar empresa');
    return r.empresa;
  }

  async desativar(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`));
  }

  async ativar(id: number): Promise<EmpresaConfig> {
    return this.atualizar(id, { nome: '', email: '', senha: '', chave: '', ativo: 1 } as any);
  }

  async testarConexao(id: number): Promise<boolean> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; tokens: { id: number; token: string | null }[] }>(
        `${this.apiUrl}/tokens`
      )
    );
    if (!r.success) return false;
    const entry = r.tokens.find(t => t.id === id);
    return !!(entry?.token);
  }
}
