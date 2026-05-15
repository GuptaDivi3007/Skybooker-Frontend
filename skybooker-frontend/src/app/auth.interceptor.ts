import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthResponse } from './models';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const backend = inject(HttpBackend);
  const rawHttp = new HttpClient(backend);
  const token = localStorage.getItem('skybooker_token');
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || req.url.includes('/auth/refresh')) {
        return throwError(() => err);
      }

      const refreshToken = localStorage.getItem('skybooker_refresh');
      if (!refreshToken) {
        clearStoredAuth();
        return throwError(() => err);
      }

      return rawHttp.post<AuthResponse>(`${environment.apiBaseUrl}/auth/refresh`, { refreshToken }).pipe(
        switchMap((res) => {
          localStorage.setItem('skybooker_token', res.accessToken);
          localStorage.setItem('skybooker_refresh', res.refreshToken);
          localStorage.setItem('skybooker_user', JSON.stringify(res.user));

          return next(req.clone({
            setHeaders: {
              Authorization: `Bearer ${res.accessToken}`
            }
          }));
        }),
        catchError((refreshError) => {
          clearStoredAuth();
          return throwError(() => refreshError);
        })
      );
    })
  );
};

function clearStoredAuth() {
  localStorage.removeItem('skybooker_token');
  localStorage.removeItem('skybooker_refresh');
  localStorage.removeItem('skybooker_user');
  window.dispatchEvent(new CustomEvent('skybooker-auth-cleared'));
}
