import { Component, inject, computed, effect, signal } from '@angular/core';
import { ApiSessionService } from '../../core/services/apiSession/api-session.service';
import { LoggerService } from '../../core/services/logger/logger.service';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [LucideAngularModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  private startSessionService = inject(ApiSessionService);
  private loggerService = inject(LoggerService);
  private authService = inject(AuthService);
  private router = inject(Router);

  // Signal reativo que atualiza automaticamente quando o token chega
  public sessionToken = this.startSessionService.token;

  constructor() {
    this.loggerService.info("LoginComponent", "Componente inicializado");
  }

  async ngOnInit() {
    // Tenta logar automaticamente se já houver sessão ativa
    this.loggerService.info("Login component", "Tentando login automático");
    if(await this.authService.login()) {
      this.router.navigate(['/select-unit']);
    }
  }

  async onSubmit(accessCode: string) {
    this.loggerService.info("Login component", "Enviando código de acesso");
    if (await this.authService.login(accessCode)) {
      this.router.navigate(['/select-unit']);
    } else {
      window.alert("Código de acesso inválido");
    }
  }
}
