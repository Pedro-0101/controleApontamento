import { inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';

@Injectable({
  providedIn: 'root',
})
export class FuncionarioService {

  private loggerService = inject(LoggerService);

  constructor() {
    this.loggerService.info("FuncionarioService", "Componente inicializado");
  }

  async getNameById(id: number): Promise<string> {
    this.loggerService.info("FuncionarioService", `Buscando nome do funcionário com ID: ${id}`);
    // Simulação de uma chamada assíncrona, como uma requisição HTTP
    return new Promise((resolve) => {
      setTimeout(() => {
        const names = ['Ana Silva', 'Bruno Cortez', 'Carla Costa', 'Daniel Silveira', 'Eduardo Lima'];
        const name = names[id % names.length];
        this.loggerService.info("FuncionarioService", `Nome encontrado: ${name}`);
        resolve(name);
      }, 10);
    });
  }
}