import { Routes } from '@angular/router';
import { AppComponent } from './app.component';

export const routes: Routes = [
  { path: '', component: AppComponent },
  { path: 'oauth2/success', component: AppComponent },
  { path: '**', redirectTo: '' }
];
