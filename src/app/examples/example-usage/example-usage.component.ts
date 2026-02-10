import { Component, inject } from '@angular/core';
import { EmployeeService } from '../../core/services/employee/employee.service';
import { Pendencia } from '../../models/pendencia/pendencia';
import { LoggerService } from '../../core/services/logger/logger.service';

/**
 * Exemplo de componente que demonstra como utilizar o EmployeeService
 * para buscar nomes de funcionários por matrícula
 */
@Component({
  selector: 'app-example-usage',
  standalone: true,
  template: `
    <div>
      <h2>Exemplo de Uso - Employee Service</h2>
      <p>Veja o console para os resultados</p>
    </div>
  `
})
export class ExampleUsageComponent {
  private employeeService = inject(EmployeeService);
  private logger = inject(LoggerService);

  async ngOnInit() {
    await this.demonstrateUsage();
  }

  /**
   * Demonstra diferentes formas de utilizar o EmployeeService
   */
  async demonstrateUsage() {
    // Exemplo 1: Buscar nome de um funcionário individual
    this.logger.info('ExampleUsage', '=== Exemplo 1: Buscar nome individual ===');
    const nome1 = await this.employeeService.getEmployeeNameByMatricula('12345');
    this.logger.info('ExampleUsage', `Nome da matrícula 12345: ${nome1}`);

    // Exemplo 2: Buscar funcionário completo
    this.logger.info('ExampleUsage', '=== Exemplo 2: Buscar funcionário completo ===');
    const employee = await this.employeeService.getEmployeeByMatricula('12345');
    if (employee) {
      this.logger.info('ExampleUsage', `Funcionário encontrado:`, employee);
    } else {
      this.logger.warn('ExampleUsage', 'Funcionário não encontrado');
    }

    // Exemplo 3: Buscar múltiplos nomes em lote
    this.logger.info('ExampleUsage', '=== Exemplo 3: Buscar múltiplos nomes ===');
    const matriculas = ['12345', '67890', '11111'];
    const nomes = await this.employeeService.getEmployeeNamesBatch(matriculas);
    this.logger.info('ExampleUsage', 'Nomes encontrados:', nomes);

    // Exemplo 4: Preencher pendências com nomes
    this.logger.info('ExampleUsage', '=== Exemplo 4: Preencher pendências ===');
    const pendencias: Pendencia[] = [
      { matricula: '12345', nome: '' },
      { matricula: '67890', nome: '' },
      { matricula: '99999', nome: '' } // Esta não existe
    ];

    const pendenciasComNomes = await this.employeeService.fillPendenciasWithNames(pendencias);
    this.logger.info('ExampleUsage', 'Pendências preenchidas:');
    pendenciasComNomes.forEach(p => {
      this.logger.info('ExampleUsage', `  Matrícula: ${p.matricula} | Nome: ${p.nome}`);
    });
  }

  /**
   * Exemplo prático: Processar lista de matrículas retornadas de uma API
   * e buscar os nomes correspondentes
   */
  async processarMatriculasRetornadas(matriculas: string[]) {
    this.logger.info('ExampleUsage', 'Processando matrículas retornadas...');

    // Buscar todos os nomes de uma vez (mais eficiente que buscar um por um)
    const employeeData = await this.employeeService.getEmployeeNamesBatch(matriculas);

    // Criar pendências com os dados
    const pendencias: Pendencia[] = employeeData.map(data => {
      const pendencia = new Pendencia();
      pendencia.matricula = data.matricula;
      pendencia.nome = data.nome;
      return pendencia;
    });

    return pendencias;
  }
}
