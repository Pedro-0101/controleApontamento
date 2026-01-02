import { Routes } from '@angular/router';
import { Login } from './feature/login/login';
import { SelectUnit } from './feature/admUnits/select-unit/select-unit';
import { Unauthorized } from './feature/others/unauthorized/unauthorized';
import { NotFound } from './feature/others/not-found/not-found';
import { authGuardGuard } from './guard/auth.guard-guard';
import { Marcations } from './feature/marcations/marcations';

export const routes: Routes = [
  { path: "login", component: Login },
  { path: "select-unit", component: SelectUnit, canActivate: [authGuardGuard] },
  { path: "marcacoes", component: Marcations, canActivate: [authGuardGuard] },
  { path: "404", component: NotFound },
  { path: "401", component: Unauthorized },
  { path: "", redirectTo: "login", pathMatch: "full" },
  { path: "**", redirectTo: "login" }
];
