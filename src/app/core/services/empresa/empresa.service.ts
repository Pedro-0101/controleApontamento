import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Empresa } from '../../../models/empresa/empresa';

@Injectable({ providedIn: 'root' })
export class EmpresaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/empresas`;

  async listar(all = false): Promise<Empresa[]> {
    const url = all ? `${this.apiUrl}?all=true` : this.apiUrl;
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; empresas: Empresa[] }>(url)
    );
    return r.success ? r.empresas : [];
  }

  async criar(nome: string): Promise<Empresa> {
    const r = await firstValueFrom(
      this.http.post<{ success: boolean; empresa: Empresa }>(this.apiUrl, { nome })
    );
    if (!r.success) throw new Error('Erro ao criar empresa');
    return r.empresa;
  }

  async atualizar(id: number, nome: string, ativo: number): Promise<Empresa> {
    const r = await firstValueFrom(
      this.http.put<{ success: boolean; empresa: Empresa }>(`${this.apiUrl}/${id}`, { nome, ativo })
    );
    if (!r.success) throw new Error('Erro ao atualizar empresa');
    return r.empresa;
  }

  async desativar(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`));
  }

  async ativar(id: number, nome: string): Promise<Empresa> {
    return this.atualizar(id, nome, 1);
  }
}
