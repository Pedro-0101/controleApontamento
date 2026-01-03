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

  async getNameByMatricula(matricula: string): Promise<string> {
    // Simulação de uma chamada assíncrona, como uma requisição HTTP
    return new Promise((resolve) => {
      setTimeout(() => {
        const names = ['Ana Silva', 'Bruno Cortez', 'Carla Costa', 'Daniel Silveira', 'Eduardo Lima'];
        const name = names[Math.floor(Math.random() * names.length)];
        resolve(name);
      }, 10);
    });
  }
}