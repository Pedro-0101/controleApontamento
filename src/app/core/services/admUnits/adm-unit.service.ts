import { inject, Injectable } from '@angular/core';
import { AdmUnit } from '../../../models/admUnit/adm-unit';
import { LoggerService } from '../logger/logger.service';
import { ApiSessionService } from '../apiSession/api-session.service';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})

export class AdmUnitService {

  private loggerService = inject(LoggerService);
  private apiSessionService = inject(ApiSessionService);

  private units: AdmUnit[] = [];
  private selectedUnit: AdmUnit | null = null;
  private apiUrl = environment.apiUrlListarUnidadesAdm;

  constructor() {
    this.loggerService.info("AdmUnitService", "Componente inicializado");
  }

  async getUnits(): Promise<AdmUnit[]> {
    this.loggerService.info("AdmUnitService", "Buscando unidades administrativas");

    try {

      const response = await this.getUnitsFromApi();

      this.units = response.map(r => AdmUnit.fromJson(r));

      this.loggerService.info("AdmUnitService", `Retornadas ${this.units.length} unidades`)
      return this.units;

    } catch (error) {

      this.loggerService.error("AdmUnitService", "Erro ao buscar unidades administrativas \n" + error);
      return [];
    }
  }

  setSelectedUnit(id: number): void {
    this.selectedUnit = this.units.find(u => u.id === id) || null;
    this.loggerService.info("AdmUnitService", "Unidade selecionada: " + this.selectedUnit?.descricao);
  }

  getSelectedUnit(): AdmUnit | null {
    return this.selectedUnit;
  }

  private async getUnitsFromApi(): Promise<AdmUnit[]> {

    const token = this.apiSessionService.token();

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tokenAcesso: token })
    });

    if (!response.ok) {
      throw new Error(`Erro na API (${response.status}): ${response.statusText}`);
    }

    const data: any = await response.json();

    return data.d;

  }
}
