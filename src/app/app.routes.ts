import { Routes } from '@angular/router';
import { Login } from './feature/login/login';
import { SelectUnit } from './feature/admUnits/select-unit/select-unit';

export const routes: Routes = [
  { path: "login", component: Login },
  { path: "select-unit", component: SelectUnit },
  { path: "", redirectTo: "login", pathMatch: "full" },
  { path: "**", redirectTo: "login" }
];
