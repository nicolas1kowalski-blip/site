import React, { createContext, useCallback, useContext, useState } from 'react';
import { rand } from '../lib/audio.js';

const FeedbackContext = createContext(() => {});
export function useCelebrate() {
  return useContext(FeedbackContext);
}

const EMOJIS = ['🌟', '🎉', '⭐', '🏆', '💫', '🎊'];
const CONFETTI_COLORS = ['#FFC93C', '#FF6B6B', '#4ECDC4', '#7FD85C', '#A06CD5', '#FF9FB5'];

export function FeedbackProvider({ children }) {
  const [show, setShow] = useState(false);
  const [emoji, setEmoji] = useState('🌟');
  const [confetti, setConfetti] = useState([]);

  const celebrate = useCallback(() => {
    setEmoji(rand(EMOJIS));
    setShow(true);
    setTimeout(() => setShow(false), 1800);

    const pieces = Array.from({ length: 40 }, (_, i) => ({
      id: `${Date.now()}-${i}-${Math.random()}`,
      left: Math.random() * 100,
      bg: rand(CONFETTI_COLORS),
      delay: Math.random() * 0.4,
      duration: 1.5 + Math.random() * 1.2,
      radius: Math.random() > 0.5 ? '50%' : '4px',
      rotate: Math.random() * 360,
    }));
    setConfetti((prev) => [...prev, ...pieces]);
    pieces.forEach((p) => {
      setTimeout(() => setConfetti((prev) => prev.filter((x) => x.id !== p.id)), 2800);
    });
  }, []);

  return (
    <FeedbackContext.Provider value={celebrate}>
      {children}
      <div className={`feedback${show ? ' show' : ''}`}>
        <div className="feedback-emoji">{emoji}</div>
      </div>
      <div className="confetti">
        {confetti.map((p) => (
          <span
            key={p.id}
            style={{
              left: p.left + 'vw',
              background: p.bg,
              animationDelay: p.delay + 's',
              animationDuration: p.duration + 's',
              borderRadius: p.radius,
              transform: `rotate(${p.rotate}deg)`,
            }}
          />
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}
