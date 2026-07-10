import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { rand } from '../lib/audio.js';

const FeedbackContext = createContext(() => {});
export function useCelebrate() {
  return useContext(FeedbackContext);
}

const EMOJIS = ['🌟', '🎉', '⭐', '🏆', '💫', '🎊'];
const CONFETTI_COLORS = ['#FFC93C', '#FF6B6B', '#4ECDC4', '#7FD85C', '#A06CD5', '#FF9FB5'];
const CONFETTI_SHAPES = ['confetti-circle', 'confetti-diamond'];

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
      shape: rand(CONFETTI_SHAPES),
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.3,
      drift: (Math.random() - 0.5) * 140,
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
      size: 10 + Math.random() * 10,
    }));
    setConfetti((prev) => [...prev, ...pieces]);
    pieces.forEach((p) => {
      setTimeout(
        () => setConfetti((prev) => prev.filter((x) => x.id !== p.id)),
        (p.duration + p.delay) * 1000 + 150
      );
    });
  }, []);

  return (
    <FeedbackContext.Provider value={celebrate}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            className="feedback"
            initial={{ opacity: 0, scale: 0.3, rotate: -15 }}
            animate={{ opacity: 1, scale: [0.3, 1.2, 1], rotate: [-15, 8, 0] }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <motion.div
              className="feedback-emoji"
              animate={{ rotate: [0, -6, 6, -4, 4, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.15 }}
            >
              {emoji}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="confetti" aria-hidden="true">
        <AnimatePresence>
          {confetti.map((p) => (
            <motion.span
              key={p.id}
              className={`confetti-piece ${p.shape}`}
              style={{ left: p.left + 'vw', width: p.size, height: p.size, background: p.bg }}
              initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
              animate={{ y: '110vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0.9, 0] }}
              transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
            />
          ))}
        </AnimatePresence>
      </div>
    </FeedbackContext.Provider>
  );
}
