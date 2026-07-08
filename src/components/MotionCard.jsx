import React from 'react';
import { motion } from 'framer-motion';
import DwellButton from './DwellButton.jsx';

const MotionDwellButton = motion.create(DwellButton);

// Carte de menu (histoire, jeu, musique...) avec une entrée en rebond
// échelonnée et un retour tactile au survol/appui — même DwellButton en
// dessous, donc le clic au survol (Tobii) n'est pas affecté.
export default function MotionCard({ index = 0, children, ...rest }) {
  return (
    <MotionDwellButton
      initial={{ opacity: 0, scale: 0.5, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay: Math.min(index, 10) * 0.05 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      {...rest}
    >
      {children}
    </MotionDwellButton>
  );
}
