/**
 * Session de l'utilisateur, exposée sous forme de signaux : qui est connecté, sur quel espace, avec quel rôle.
 * Chargée une fois au démarrage (garde des routes), mise à jour à la connexion, à la déconnexion et au
 * changement d'espace.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { ClientApiService } from './client-api.service';
import { Espace, Identite, RoleEspace, Utilisateur, roleSuffisant } from './modeles';

@Injectable({ providedIn: 'root' })
export class SessionService {
    private readonly api = inject(ClientApiService);

    readonly utilisateur = signal<Utilisateur | null>(null);
    readonly espaceCourant = signal<Espace | null>(null);
    readonly espaces = signal<Espace[]>([]);
    /** Vrai une fois que /auth/moi a répondu (connecté ou non) : évite de rediriger avant de savoir. */
    readonly chargee = signal(false);

    readonly estConnecte = computed(() => this.utilisateur() !== null);
    readonly estAdministrateurGlobal = computed(() => this.utilisateur()?.roleGlobal === 'administrateur');
    readonly roleDansEspace = computed<RoleEspace | undefined>(() => this.espaceCourant()?.role);
    readonly peutEditer = computed(() => roleSuffisant(this.roleDansEspace(), 'editeur'));
    readonly peutAdministrerEspace = computed(() => roleSuffisant(this.roleDansEspace(), 'administrateur'));

    /** Interroge le serveur pour savoir si une session est ouverte (cookie). Ne lève jamais d'erreur. */
    async charger(): Promise<void> {
        try {
            this.appliquer(await this.api.moi());
        } catch (erreur) {
            this.appliquer(null);
        } finally {
            this.chargee.set(true);
        }
    }

    async connecter(identifiant: string, motDePasse: string): Promise<void> {
        this.appliquer(await this.api.connexion(identifiant, motDePasse));
    }

    async deconnecter(): Promise<void> {
        try {
            await this.api.deconnexion();
        } finally {
            this.appliquer(null);
        }
    }

    async changerEspace(code: string): Promise<void> {
        this.appliquer(await this.api.changerEspaceCourant(code));
    }

    private appliquer(identite: Identite | null): void {
        this.utilisateur.set(identite ? identite.utilisateur : null);
        this.espaceCourant.set(identite ? identite.espaceCourant : null);
        this.espaces.set(identite ? identite.espaces : []);
    }
}
