import { Component, inject, signal } from '@angular/core';
import { AdmUnit } from '../../../models/admUnit/adm-unit';
import { LoggerService } from '../../../core/services/logger/logger.service';
import { AdmUnitService } from '../../../core/services/admUnits/adm-unit.service';

@Component({
  selector: 'app-select-unit',
  imports: [],
  templateUrl: './select-unit.html',
  styleUrl: './select-unit.css',
})
export class SelectUnit {

  private loggerService = inject(LoggerService);
  private admUnitService = inject(AdmUnitService);

  protected isLoading = signal(false);

  protected units: AdmUnit[] = [];

  constructor() {
    this.loggerService.info("SelectUnitComponent", "Componente inicializado");
  }

  async ngOnInit(): Promise<void> {
    this.units = [];
    this.isLoading.set(true);
    this.units = await this.admUnitService.getUnits();
    this.isLoading.set(false);
  }

  getUnits(): AdmUnit[] {
    return this.units;
  }
}
