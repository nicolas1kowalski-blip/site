import React, { useState } from 'react';
import { appState } from '../lib/appState.js';
import { useBooks } from '../context/BooksContext.jsx';

export default function SettingsPanel({ open, onClose }) {
  const [dwellEnabled, setDwellEnabled] = useState(appState.dwellEnabled);
  const [dwellTime, setDwellTime] = useState(appState.dwellTime);
  const [gazeReadEnabled, setGazeReadEnabled] = useState(appState.gazeReadEnabled);
  const [gazeReadTime, setGazeReadTime] = useState(appState.gazeReadTime);
  const [soundEnabled, setSoundEnabled] = useState(appState.soundEnabled);
  const [speechRate, setSpeechRate] = useState(appState.speechRate);
  const [wordGazeEnabled, setWordGazeEnabled] = useState(appState.wordGazeEnabled);
  const [autoAdvance, setAutoAdvance] = useState(appState.autoAdvance);

  const [adminPassword, setAdminPassword] = useState('');
  const { isAdmin, login, logout, loginError, loggingIn, clearLoginError } = useBooks();

  const handleLogin = async () => {
    const ok = await login(adminPassword);
    if (ok) setAdminPassword('');
  };

  return (
    <aside className={`settings${open ? ' open' : ''}`} aria-label="Paramètres">
      <button className="close" aria-label="Fermer" onClick={onClose}>
        ✕
      </button>
      <h2>Paramètres</h2>

      <h3>👁 Commande oculaire</h3>
      <label className="check-row">
        <input
          type="checkbox"
          checked={dwellEnabled}
          onChange={(e) => {
            setDwellEnabled(e.target.checked);
            appState.dwellEnabled = e.target.checked;
          }}
        />
        <span>Activer le clic au survol</span>
      </label>
      <label>
        <span>
          Durée pour cliquer : <strong>{(dwellTime / 1000).toFixed(1)}</strong> s
        </span>
        <input
          type="range"
          min="500"
          max="3000"
          step="100"
          value={dwellTime}
          onChange={(e) => {
            const v = +e.target.value;
            setDwellTime(v);
            appState.dwellTime = v;
            document.documentElement.style.setProperty('--dwell-ms', v + 'ms');
          }}
        />
      </label>

      <h3>🗣️ Lire au regard</h3>
      <label className="check-row">
        <input
          type="checkbox"
          checked={gazeReadEnabled}
          onChange={(e) => {
            setGazeReadEnabled(e.target.checked);
            appState.gazeReadEnabled = e.target.checked;
          }}
        />
        <span>Dire le mot quand on regarde un élément</span>
      </label>
      <label>
        <span>
          Durée du regard : <strong>{(gazeReadTime / 1000).toFixed(1)}</strong> s
        </span>
        <input
          type="range"
          min="300"
          max="2000"
          step="100"
          value={gazeReadTime}
          onChange={(e) => {
            const v = +e.target.value;
            setGazeReadTime(v);
            appState.gazeReadTime = v;
          }}
        />
      </label>

      <h3>🔊 Son</h3>
      <label className="check-row">
        <input
          type="checkbox"
          checked={soundEnabled}
          onChange={(e) => {
            setSoundEnabled(e.target.checked);
            appState.soundEnabled = e.target.checked;
            if (!e.target.checked) speechSynthesis?.cancel();
          }}
        />
        <span>Sons et voix activés</span>
      </label>
      <label>
        <span>
          Vitesse de la voix : <strong>{speechRate.toFixed(2)}</strong>
        </span>
        <input
          type="range"
          min="0.6"
          max="1.2"
          step="0.05"
          value={speechRate}
          onChange={(e) => {
            const v = +e.target.value;
            setSpeechRate(v);
            appState.speechRate = v;
          }}
        />
      </label>

      <h3>📖 Histoires</h3>
      <label className="check-row">
        <input
          type="checkbox"
          checked={wordGazeEnabled}
          onChange={(e) => {
            setWordGazeEnabled(e.target.checked);
            appState.wordGazeEnabled = e.target.checked;
          }}
        />
        <span>Avancer la page en suivant les mots du regard</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={autoAdvance}
          onChange={(e) => {
            setAutoAdvance(e.target.checked);
            appState.autoAdvance = e.target.checked;
          }}
        />
        <span>Tourner les pages automatiquement</span>
      </label>

      <div className="info">
        <strong>👁 Configurer Tobii :</strong>
        <br />
        1. Dans le logiciel Tobii (Windows Control), activez le module « Contrôle de l'ordinateur » : le regard
        déplace le curseur de la souris.
        <br />
        2. Ici, laissez « Activer le clic au survol » coché : rester quelques secondes sur un bouton suffit à
        cliquer, aucun geste n'est nécessaire.
        <br />
        3. Ajustez la « Durée pour cliquer » selon l'aisance de l'enfant (plus long = moins de clics accidentels).
        <br />
        <br />
        <strong>💡 Pour GRID 3 :</strong>
        <br />
        Désactivez le clic au survol et laissez GRID 3 gérer la sélection. La fonction "Lire au regard" reste utile
        avec la souris pour vérifier le bon fonctionnement.
      </div>

      <h3>🔒 Administration</h3>
      {!isAdmin ? (
        <div>
          <label>
            <span>Mot de passe administrateur :</span>
            <input
              type="password"
              placeholder="Mot de passe"
              autoComplete="current-password"
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value);
                clearLoginError();
              }}
            />
          </label>
          <button
            type="button"
            className="btn-save"
            style={{ width: '100%' }}
            disabled={loggingIn}
            onClick={handleLogin}
          >
            {loggingIn ? 'Connexion...' : 'Se connecter'}
          </button>
          {loginError && (
            <div className="info" style={{ background: '#FFE0E0' }}>
              {loginError}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="info">✅ Connecté(e) en tant qu'administrateur. Vous pouvez ajouter et supprimer des livres.</div>
          <button type="button" className="btn-cancel" style={{ width: '100%' }} onClick={logout}>
            Se déconnecter
          </button>
        </div>
      )}
    </aside>
  );
}
