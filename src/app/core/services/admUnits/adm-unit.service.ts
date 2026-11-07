import { inject, Injectable } from '@angular/core';
import { AdmUnit } from '../../../models/admUnit/adm-unit';
import { LoggerService } from '../logger/logger.service';
import { PontoApiService } from '../ponto-api/ponto-api.service';
import { MarcacaoDia } from '../../../models/marcacaoDia/marcacao-dia';

@Injectable({
  providedIn: 'root',
})

export class AdmUnitService {

  private loggerService = inject(LoggerService);
  private pontoApi = inject(PontoApiService);

  private units: AdmUnit[] = [];
  private selectedUnit: AdmUnit | null = null;

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
    const results = await this.pontoApi.postAllCompanies(
      'ListarUnidadeAdministrativa',
      () => ({})
    );

    const rows = results.flatMap(result =>
      this.pontoApi.extractArray(result.response)
    );

    // Uma mesma unidade pode aparecer em mais de uma empresa/token.
    const vistos = new Set<number>();
    return rows.filter(row => {
      const id = Number(row?.Id ?? row?.id);
      if (!Number.isFinite(id) || vistos.has(id)) return false;
      vistos.add(id);
      return true;
    });
  }
}
