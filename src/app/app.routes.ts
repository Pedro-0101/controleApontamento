import { Routes } from '@angular/router';
import { Login } from './feature/login/login';
import { Unauthorized } from './feature/others/unauthorized/unauthorized';
import { NotFound } from './feature/others/not-found/not-found';
import { authGuardGuard } from './guard/auth.guard-guard';
import { PainelGestao } from './feature/painel-gestao/painel-gestao';

export const routes: Routes = [
  { path: "login", component: Login },
  { path: "painel-gestao", component: PainelGestao, canActivate: [authGuardGuard] },
  { path: "404", component: NotFound },
  { path: "401", component: Unauthorized },
  { path: "", redirectTo: "login", pathMatch: "full" },
  { path: "**", redirectTo: "login" }
];
