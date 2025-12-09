import { Component, inject, computed, effect, signal } from '@angular/core';
import { ApiSessionService } from '../../core/services/apiSession/api-session.service';
import { LoggerService } from '../../core/services/logger/logger.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-login',
  imports: [LucideAngularModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  private startSessionService = inject(ApiSessionService)
  private loggerService = inject(LoggerService)

  // Signal reativo que atualiza automaticamente quando o token chega
  public sessionToken = this.startSessionService.token;

  constructor() {
    this.loggerService.info("[Login component] - Componente inicializado");
  }

  onSubmit() {
    this.loggerService.info("[Login component] - Formulário enviado");
  }
}
