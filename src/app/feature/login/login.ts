import { Component, inject, computed, effect, signal } from '@angular/core';
import { ApiSessionService } from '../../core/services/apiSession/api-session.service';
import { LoggerService } from '../../core/services/logger/logger.service';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [LucideAngularModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  private startSessionService = inject(ApiSessionService)
  private loggerService = inject(LoggerService)
  private authService = inject(AuthService)

  // Signal reativo que atualiza automaticamente quando o token chega
  public sessionToken = this.startSessionService.token;

  constructor() {
    this.loggerService.info("[Login component] - Componente inicializado");
  }

  onSubmit(accessCode: string) {
    this.loggerService.info("[Login component] - Formulário enviado");
    if (this.authService.login(accessCode)) {
      this.startSessionService.startSession();
    } else {
      window.alert("Código de acesso inválido");
    }
  }
}
