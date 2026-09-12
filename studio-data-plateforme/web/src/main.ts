/** Point d'entrée du front : démarre l'application Angular avec sa configuration (routes, HTTP). */
import { bootstrapApplication } from '@angular/platform-browser';
import { configurationApplication } from './app/app.config';
import { RacineComponent } from './app/app';

bootstrapApplication(RacineComponent, configurationApplication).catch(erreur => console.error('Démarrage du front impossible', erreur));
