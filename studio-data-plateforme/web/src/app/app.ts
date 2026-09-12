/** Composant racine : il ne fait qu'afficher la route courante (page de connexion ou coque). */
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-racine',
    imports: [RouterOutlet],
    template: '<router-outlet />'
})
export class RacineComponent {}
