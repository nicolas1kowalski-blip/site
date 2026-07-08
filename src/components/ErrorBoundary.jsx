import React from 'react';

// Filet de sécurité : si un composant plante, l'enfant (souvent seul face à
// l'appareil) ne doit jamais se retrouver bloqué sur un écran blanc muet.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Erreur applicative :', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '5vh 5vw',
          gap: '20px',
          fontFamily: "'Baloo 2', sans-serif",
        }}
      >
        <div style={{ fontSize: 'clamp(48px, 10vw, 96px)' }}>😊</div>
        <h1 style={{ fontSize: 'clamp(22px, 4vw, 32px)', margin: 0 }}>Oups, un petit souci !</h1>
        <p style={{ fontSize: 'clamp(16px, 2.5vw, 20px)', maxWidth: 480 }}>
          L'application a rencontré un problème. Touchez le bouton pour recommencer.
        </p>
        <button
          type="button"
          className="btn-save"
          style={{ fontSize: 'clamp(18px, 2.5vw, 24px)', padding: '16px 32px' }}
          onClick={() => window.location.reload()}
        >
          🔄 Recharger l'application
        </button>
      </div>
    );
  }
}
