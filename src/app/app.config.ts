import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  LucideAngularModule,
  User,
  ShoppingCart,
  LogOut,
  Tag,
  Image,
  Package,
  X,
  Search,
  Trash2,
  LogIn,
  UserPlus,
  Eye,
  Calendar,
  Bell,
  Clock,
  FileText,
  Settings,
  Download,
} from 'lucide-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    importProvidersFrom(LucideAngularModule.pick({
      User,
      ShoppingCart,
      LogOut,
      Tag,
      Image,
      Package,
      X,
      Search,
      Trash2,
      LogIn,
      UserPlus,
      Eye,
      Calendar,
      Bell,
      Clock,
      FileText,
      Settings,
      Download,
    }))
  ]
};
