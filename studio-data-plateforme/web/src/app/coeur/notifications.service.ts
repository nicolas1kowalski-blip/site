/** Notifications (« toasts ») affichées en bas de l'écran par la coque : succès, information ou erreur. */
import { Injectable, computed, signal } from '@angular/core';

export type Notification = { id: number; genre: 'succes' | 'info' | 'erreur'; message: string };

/** Au-delà, les plus anciennes attendent leur tour : l'écran ne se couvre pas de messages. */
const VISIBLES_MAXIMUM = 4;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
    readonly liste = signal<Notification[]>([]);
    /** Les dernières notifications, au plus quatre à l'écran. */
    readonly visibles = computed(() => this.liste().slice(-VISIBLES_MAXIMUM));
    private prochainId = 1;

    succes(message: string): void {
        this.ajouter('succes', message);
    }
    info(message: string): void {
        this.ajouter('info', message);
    }
    erreur(message: string | Error): void {
        this.ajouter('erreur', message instanceof Error ? message.message : message, 8000);
    }

    fermer(id: number): void {
        this.liste.update(liste => liste.filter(notification => notification.id !== id));
    }
    toutFermer(): void {
        this.liste.set([]);
    }

    private ajouter(genre: Notification['genre'], message: string, duree = 4000): void {
        const notification: Notification = { id: this.prochainId++, genre, message };
        this.liste.update(liste => [...liste, notification]);
        setTimeout(() => this.fermer(notification.id), duree);
    }
}
