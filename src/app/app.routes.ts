import { Routes } from '@angular/router';
import { Login } from './feature/login/login';
import { Unauthorized } from './feature/others/unauthorized/unauthorized';
import { NotFound } from './feature/others/not-found/not-found';
import { authGuardGuard } from './guard/auth.guard-guard';
import { PainelGestao } from './feature/painel-gestao/painel-gestao';

export const routes: Routes = [
  { path: "login", component: Login },
  { path: "painel-pontos", component: PainelGestao, canActivate: [authGuardGuard] },
  {
    path: "colaboradores",
    loadComponent: () => import('./feature/colaboradores/colaboradores').then(m => m.Colaboradores),
    canActivate: [authGuardGuard]
  },
  {
    path: "relogios",
    loadComponent: () => import('./feature/relogios/relogios').then(m => m.Relogios),
    canActivate: [authGuardGuard]
  },
  {
    path: "relatorios",
    loadComponent: () => import('./feature/relatorios/relatorios').then(m => m.Relatorios),
    canActivate: [authGuardGuard]
  },
  {
    path: "auditoria",
    loadComponent: () => import('./feature/auditoria/auditoria').then(m => m.Auditoria),
    canActivate: [authGuardGuard]
  },
  {
    path: "eventos",
    loadComponent: () => import('./feature/eventos/eventos').then(m => m.EventosComponent),
    canActivate: [authGuardGuard]
  },
  { path: "404", component: NotFound },
  { path: "401", component: Unauthorized },
  { path: "", redirectTo: "login", pathMatch: "full" },
  { path: "**", redirectTo: "login" }
];
