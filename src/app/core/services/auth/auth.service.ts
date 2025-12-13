import { computed, inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private logger = inject(LoggerService);
  private userCodes: string[] = environment.dnpAccessCode.split(',');
  private userNames: string[] = environment.dnpUserNames.split(',');
  private userName = signal('');
  readonly _userName = computed(() => this.userName());

  constructor() {
    this.logger.info("[AuthService] - AuthService inicializado");
  }

  login(accessCode: string) {
    this.logger.info("[AuthService] - Tentando iniciar sessão");
    this.userName.set(this.userNames[this.userCodes.indexOf(accessCode)]);
  }

  logout() {
    this.logger.info("[AuthService] - Tentando encerrar sessão");
    this.userName.set('');
    document.cookie = `userName=; path=/`;
  }

}
