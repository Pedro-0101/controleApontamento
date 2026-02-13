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
  employees: Array<{ matricula: string; nome: string; empresa: string }>;
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
  async getEmployeeNamesBatch(matriculas: string[]): Promise<Array<{ matricula: string; nome: string; empresa: string }>> {
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
      return matriculas.map(matricula => ({ matricula, nome: 'nome nao encontrado', empresa: '' }));
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao buscar nomes em lote:', error);
      return matriculas.map(matricula => ({ matricula, nome: 'nome nao encontrado', empresa: '' }));
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

  /**
   * Busca todos os funcionários (ativos e inativos)
   * @returns Array de todos os funcionários
   */
  async getAllEmployees(): Promise<Employee[]> {
    try {
      this.logger.info('EmployeeService', 'Buscando todos os funcionários');

      const response = await firstValueFrom(
        this.http.get<{ success: boolean; employees: any[]; count: number }>(`${this.apiUrl}/employees`)
      );

      if (response.success) {
        this.logger.info('EmployeeService', `${response.count} funcionários encontrados`);
        return response.employees.map(emp => Employee.fromJson(emp));
      }

      this.logger.warn('EmployeeService', 'Nenhum funcionário encontrado');
      return [];
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao buscar funcionários:', error);
      return [];
    }
  }

  /**
   * Cria um novo funcionário
   * @param employee - Dados do funcionário
   * @returns Funcionário criado
   */
  async createEmployee(employee: Partial<Employee>): Promise<Employee | null> {
    try {
      this.logger.info('EmployeeService', 'Criando novo funcionário');

      const response = await firstValueFrom(
        this.http.post<{ success: boolean; employee: any; message?: string }>(`${this.apiUrl}/employees`, employee)
      );

      if (response.success && response.employee) {
        this.logger.info('EmployeeService', 'Funcionário criado com sucesso');
        return Employee.fromJson(response.employee);
      }

      return null;
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao criar funcionário:', error);
      throw error;
    }
  }

  /**
   * Atualiza um funcionário existente
   * @param id - ID do funcionário
   * @param employee - Dados atualizados
   * @returns Funcionário atualizado
   */
  async updateEmployee(id: number, employee: Partial<Employee>): Promise<Employee | null> {
    try {
      this.logger.info('EmployeeService', `Atualizando funcionário ID: ${id}`);

      const response = await firstValueFrom(
        this.http.put<{ success: boolean; employee: any; message?: string }>(`${this.apiUrl}/employees/${id}`, employee)
      );

      if (response.success && response.employee) {
        this.logger.info('EmployeeService', 'Funcionário atualizado com sucesso');
        return Employee.fromJson(response.employee);
      }

      return null;
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao atualizar funcionário:', error);
      throw error;
    }
  }

  /**
   * Deleta um funcionário
   * @param id - ID do funcionário
   * @returns True se deletado com sucesso
   */
  async deleteEmployee(id: number): Promise<boolean> {
    try {
      this.logger.info('EmployeeService', `Deletando funcionário ID: ${id}`);

      const response = await firstValueFrom(
        this.http.delete<{ success: boolean; message?: string }>(`${this.apiUrl}/employees/${id}`)
      );

      if (response.success) {
        this.logger.info('EmployeeService', 'Funcionário deletado com sucesso');
        return true;
      }

      return false;
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao deletar funcionário:', error);
      throw error;
    }
  }
  /**
   * Desativa múltiplos funcionários (ativo=0)
   * @param ids - Array de IDs dos funcionários
   * @returns True se atualizado com sucesso
   */
  async deactivateEmployeesBatch(ids: number[]): Promise<boolean> {
    try {
      this.logger.info('EmployeeService', `Desativando ${ids.length} funcionários em lote`);

      const response = await firstValueFrom(
        this.http.post<{ success: boolean; message?: string }>(`${this.apiUrl}/employees/batch-deactivate`, { ids })
      );

      return response.success;
    } catch (error: any) {
      this.logger.error('EmployeeService', 'Erro ao desativar funcionários em lote:', error);
      throw error;
    }
  }
}
