import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';
import { Employee } from '../../../models/employee/employee';
import { Pendencia } from '../../../models/pendencia/pendencia';

interface EmployeeResponse {
  success: boolean;
  employee: any;
  message?: string;
}

interface BatchEmployeeResponse {
  success: boolean;
  employees: Array<{ matricula: string; nome: string }>;
  error?: string;
}

interface ActiveEmployeesResponse {
  success: boolean;
  employees: any[];
  count: number;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class EmployeeService {
  private logger = inject(LoggerService);
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {
    this.logger.info('EmployeeService', 'Serviço inicializado');
  }

  /**
   * Busca o nome de um funcionário por matrícula
   * @param matricula - Matrícula do funcionário
   * @returns Nome do funcionário ou "nome nao encontrado"
   */
  async getEmployeeNameByMatricula(matricula: string): Promise<string> {
    try {
      this.logger.info('EmployeeService', `Buscando nome para matrícula: ${matricula}`);

      const response = await firstValueFrom(
        this.http.get<EmployeeResponse>(`${this.apiUrl}/employee/${matricula}`)
      );

      if (response.success && response.employee) {
        this.logger.info('EmployeeService', `Nome encontrado: ${response.employee.nome}`);
        return response.employee.nome;
      }

      this.logger.warn('EmployeeService', `Matrícula ${matricula} não encontrada`);
      return 'nome nao encontrado';
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao buscar nome do funcionário:', error);
      return 'nome nao encontrado';
    }
  }

  /**
   * Busca o funcionário completo por matrícula
   * @param matricula - Matrícula do funcionário
   * @returns Objeto Employee ou null
   */
  async getEmployeeByMatricula(matricula: string): Promise<Employee | null> {
    try {
      this.logger.info('EmployeeService', `Buscando funcionário com matrícula: ${matricula}`);

      const response = await firstValueFrom(
        this.http.get<EmployeeResponse>(`${this.apiUrl}/employee/${matricula}`)
      );

      if (response.success && response.employee) {
        return Employee.fromJson(response.employee);
      }

      return null;
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao buscar funcionário:', error);
      return null;
    }
  }

  /**
   * Busca múltiplos funcionários por matrícula (batch)
   * @param matriculas - Array de matrículas
   * @returns Array de objetos com matricula e nome
   */
  async getEmployeeNamesBatch(matriculas: string[]): Promise<Array<{ matricula: string; nome: string }>> {
    try {
      this.logger.info('EmployeeService', `Buscando nomes para ${matriculas.length} matrículas`);

      const response = await firstValueFrom(
        this.http.post<BatchEmployeeResponse>(`${this.apiUrl}/employees/batch`, { matriculas })
      );

      if (response.success) {
        this.logger.info('EmployeeService', 'Nomes encontrados com sucesso');
        return response.employees;
      }

      this.logger.warn('EmployeeService', 'Erro ao buscar nomes em lote');
      return matriculas.map(matricula => ({ matricula, nome: 'nome nao encontrado' }));
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao buscar nomes em lote:', error);
      return matriculas.map(matricula => ({ matricula, nome: 'nome nao encontrado' }));
    }
  }

  /**
   * Preenche os nomes em uma lista de pendências
   * @param pendencias - Array de pendências com matrícula
   * @returns Array de pendências com nomes preenchidos
   */
  async fillPendenciasWithNames(pendencias: Pendencia[]): Promise<Pendencia[]> {
    const matriculas = pendencias.map(p => p.matricula);
    const employeeNames = await this.getEmployeeNamesBatch(matriculas);

    // Criar um mapa de matrícula -> nome
    const nameMap = new Map<string, string>();
    employeeNames.forEach(emp => {
      nameMap.set(emp.matricula, emp.nome);
    });

    // Preencher os nomes nas pendências
    pendencias.forEach(pendencia => {
      pendencia.nome = nameMap.get(pendencia.matricula) || 'nome nao encontrado';
    });

    return pendencias;
  }

  /**
   * Busca todos os funcionários ativos (ativo=1)
   * @returns Array de funcionários ativos
   */
  async getAllActiveEmployees(): Promise<Employee[]> {
    try {
      this.logger.info('EmployeeService', 'Buscando todos os funcionários ativos');

      const response = await firstValueFrom(
        this.http.get<ActiveEmployeesResponse>(`${this.apiUrl}/employees/active`)
      );

      if (response.success) {
        this.logger.info('EmployeeService', `${response.count} funcionários ativos encontrados`);
        return response.employees.map(emp => Employee.fromJson(emp));
      }

      this.logger.warn('EmployeeService', 'Nenhum funcionário ativo encontrado');
      return [];
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao buscar funcionários ativos:', error);
      return [];
    }
  }
}
