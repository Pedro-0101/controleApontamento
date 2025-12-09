import { Routes } from '@angular/router';
import { Login } from './feature/login/login';

export const routes: Routes = [
  { path: "login", component: Login },
  { path: "", redirectTo: "login", pathMatch: "full" },
  { path: "**", redirectTo: "login" }
];
