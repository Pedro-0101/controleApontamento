import { inject, Injectable } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { EmployeeService } from '../employee/employee.service';

@Injectable({
  providedIn: 'root',
})
export class FuncionarioService {

  private loggerService = inject(LoggerService);
  private employeeService = inject(EmployeeService);

  constructor() {
    this.loggerService.info("FuncionarioService", "Componente inicializado");
  }

  /**
   * Busca o nome do funcionário pela matrícula no banco de dados MySQL
   * @param matricula - Matrícula do funcionário
   * @returns Nome do funcionário ou "nome nao encontrado" se não existir
   */
  async getNameByMatricula(matricula: string): Promise<string> {
    this.loggerService.info("FuncionarioService", `Buscando nome para matrícula: ${matricula}`);

    try {
      const nome = await this.employeeService.getEmployeeNameByMatricula(matricula);
      this.loggerService.info("FuncionarioService", `Nome encontrado: ${nome}`);
      return nome;
    } catch (error) {
      this.loggerService.error("FuncionarioService", `Erro ao buscar nome para matrícula ${matricula}:`, error);
      return 'nome nao encontrado';
    }
  }
}
