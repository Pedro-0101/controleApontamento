import { Component, inject, signal } from '@angular/core';
import { AdmUnit } from '../../../models/admUnit/adm-unit';
import { LoggerService } from '../../../core/services/logger/logger.service';
import { AdmUnitService } from '../../../core/services/admUnits/adm-unit.service';
import { FuncionarioService } from '../../../core/services/funcionario/funcionario.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-select-unit',
  imports: [],
  templateUrl: './select-unit.html',
  styleUrl: './select-unit.css',
})
export class SelectUnit {

  private loggerService = inject(LoggerService);
  private admUnitService = inject(AdmUnitService);
  private router = inject(Router);

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

  onSelectUnit(unitId: number): void {
    this.loggerService.info("SelectUnitComponent", "Unidade selecionada: " + unitId);

    this.admUnitService.setSelectedUnit(unitId);

    this.router.navigate(['/painel-gestao']);

  }
}
