import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { LocalModel } from '../../../models/local/local-model';

@Injectable({ providedIn: 'root' })
export class LocalService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/locais`;

  async listar(all = false): Promise<LocalModel[]> {
    const url = all ? `${this.apiUrl}?all=true` : this.apiUrl;
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; locais: LocalModel[] }>(url)
    );
    return r.success ? r.locais : [];
  }

  async criar(nome: string): Promise<LocalModel> {
    const r = await firstValueFrom(
      this.http.post<{ success: boolean; local: LocalModel }>(this.apiUrl, { nome })
    );
    if (!r.success) throw new Error('Erro ao criar local');
    return r.local;
  }

  async atualizar(id: number, nome: string, ativo: number): Promise<LocalModel> {
    const r = await firstValueFrom(
      this.http.put<{ success: boolean; local: LocalModel }>(`${this.apiUrl}/${id}`, { nome, ativo })
    );
    if (!r.success) throw new Error('Erro ao atualizar local');
    return r.local;
  }

  async desativar(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`));
  }

  async ativar(id: number, nome: string): Promise<LocalModel> {
    return this.atualizar(id, nome, 1);
  }
}
