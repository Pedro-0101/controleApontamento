import { Component, inject, signal, OnInit } from '@angular/core';
import { Marcacao } from '../../models/marcacao/marcacao';
import { DatePipe } from '@angular/common';
import { FuncionarioService } from '../../core/services/funcionario/funcionario.service';
import { LoggerService } from '../../core/services/logger/logger.service';

@Component({
  selector: 'app-marcations',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './marcations.html',
  styleUrl: './marcations.css',
  providers: [DatePipe] // Necessário se for usar o pipe no TS, mas no HTML basta o imports
})
export class Marcations implements OnInit {

  private loggerService = inject(LoggerService);
  private funcionarioService = inject(FuncionarioService);

  protected isLoading = signal(false);
  // Transformado em Signal para garantir a atualização da tela
  protected listaMarcacoes = signal<Marcacao[]>([]);
  
  constructor() {
    this.loggerService.info("MarcationsComponent", "Componente inicializado");
  }

  ngOnInit() {
    this.loadMarcacoes();
  }

  private async loadMarcacoes() {
    this.isLoading.set(true);
    this.loggerService.info("MarcationsComponent", "Carregando marcações");

    try {
      // Usando await para simplificar a leitura do fluxo assíncrono
      const marcacoes = await this.funcionarioService.getMarcacoes();
      
      this.listaMarcacoes.set(marcacoes);
      this.loggerService.info("MarcationsComponent", `Carregadas ${marcacoes.length} marcações`);
    } catch (error) {
      this.loggerService.error("MarcationsComponent", "Erro ao carregar marcações \n" + error);
    } finally {
      this.isLoading.set(false);
    }
  }
}