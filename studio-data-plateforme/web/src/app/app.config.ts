/**
 * Configuration de l'application Angular : routeur, client HTTP (avec l'intercepteur qui traduit les
 * erreurs de l'API en messages lisibles) et détection de changements par zone (rendu simple et prévisible).
 */
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { intercepteurErreursApi } from './coeur/client-api.service';
import { routes } from './app.routes';

export const configurationApplication: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([intercepteurErreursApi]))
    ]
};
