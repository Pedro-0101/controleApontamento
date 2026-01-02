import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { AuthService } from '../core/services/auth/auth.service';
import { inject } from '@angular/core';
import { LoggerService } from '../core/services/logger/logger.service';

export const authGuardGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const loggerService = inject(LoggerService);
  const router = inject(Router);

  loggerService.info("AuthGuard", `Verificando autenticação do usuário para rota: ${state.url}`);

  if (authService._authenticated()) {
    loggerService.info("AuthGuard", "Acesso permitido");
    return true;
  }

  loggerService.warn("AuthGuard", "Acesso negado - usuário não autenticado");

  const isLoggedIn = await verifyActiveLoginSession(authService, loggerService);
  
  if (isLoggedIn) {
    loggerService.info("AuthGuard", "Sessão de login ativa verificada com sucesso");
    return true;
  }

  const url = router.parseUrl(`/401?returnUrl=${state.url}`);
  return new RedirectCommand(url);
};

async function verifyActiveLoginSession(authService: AuthService, loggerService: LoggerService): Promise<boolean> {
  loggerService.info("AuthGuard", "Verificando sessão de login ativa");
  try {
    return await authService.login();
  } catch {
    return false;
  }
}