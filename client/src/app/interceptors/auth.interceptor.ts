import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap } from 'rxjs/operators';

let refreshInFlight$: Observable<string> | null = null;

export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isAuthRoute = req.url.includes('/api/auth/login')
    || req.url.includes('/api/auth/register')
    || req.url.includes('/api/auth/refresh');
  const token = auth.getToken();
  const authorizedReq = !isAuthRoute && token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : req;

  return next(authorizedReq).pipe(
    catchError((err: unknown) => {
      const httpErr = err as HttpErrorResponse;
      if (
        isAuthRoute ||
        httpErr?.status !== 401
      ) {
        return throwError(() => err);
      }

      const refreshToken = auth.getRefreshToken();
      if (!refreshToken) {
        auth.logout();
        router.navigate(['/login']);
        return throwError(() => err);
      }

      if (!refreshInFlight$) {
        refreshInFlight$ = auth.refresh(refreshToken).pipe(
          map((response) => {
            auth.saveAuth(response);
            return response.access_token;
          }),
          shareReplay(1),
          finalize(() => {
            refreshInFlight$ = null;
          }),
          catchError((refreshErr) => {
            auth.logout();
            router.navigate(['/login']);
            return throwError(() => refreshErr);
          }),
        );
      }

      return refreshInFlight$.pipe(
        switchMap((newAccessToken) =>
          next(
            req.clone({
              setHeaders: {
                Authorization: `Bearer ${newAccessToken}`,
              },
            }),
          ),
        ),
      );
    }),
  );
};
