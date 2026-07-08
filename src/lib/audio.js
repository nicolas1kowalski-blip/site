import { appState } from './appState.js';

let frenchVoice = null;
function pickFrenchVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  frenchVoice =
    voices.find((v) => /fr[-_]FR/i.test(v.lang)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('fr')) ||
    voices[0];
}
if ('speechSynthesis' in window) {
  pickFrenchVoice();
  speechSynthesis.onvoiceschanged = pickFrenchVoice;
}

export function speak(text, onEnd, interrupt = true) {
  if (!appState.soundEnabled || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  u.rate = appState.speechRate;
  u.pitch = 1.15;
  if (frenchVoice) u.voice = frenchVoice;
  u.onend = () => onEnd?.();
  speechSynthesis.speak(u);
}

let audioCtx = null;
export function ensureAudio() {
  if (!audioCtx && window.AudioContext) audioCtx = new AudioContext();
}
export function playTone(freq, duration = 0.18, type = 'sine', vol = 0.25) {
  if (!appState.soundEnabled) return;
  ensureAudio();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  o.stop(audioCtx.currentTime + duration);
}
export function successSound() {
  playTone(523, 0.12);
  setTimeout(() => playTone(659, 0.12), 120);
  setTimeout(() => playTone(784, 0.2), 240);
}
export function wrongSound() {
  playTone(220, 0.15, 'sawtooth', 0.15);
}
export function pageSound() {
  playTone(660, 0.08);
  setTimeout(() => playTone(880, 0.1), 80);
}
export function gazeSound() {
  playTone(880, 0.06, 'sine', 0.12);
}
export function popSound() {
  ensureAudio();
  if (!audioCtx || !appState.soundEnabled) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(900, now);
  o.frequency.exponentialRampToValueAtTime(100, now + 0.12);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(now);
  o.stop(now + 0.15);
}
export function playXyloNote(freq, duration = 0.9) {
  ensureAudio();
  if (!audioCtx || !appState.soundEnabled) return;
  const now = audioCtx.currentTime;
  const o1 = audioCtx.createOscillator();
  o1.type = 'triangle';
  o1.frequency.value = freq;
  const g1 = audioCtx.createGain();
  g1.gain.setValueAtTime(0.001, now);
  g1.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  g1.gain.exponentialRampToValueAtTime(0.001, now + duration);
  o1.connect(g1);
  g1.connect(audioCtx.destination);
  o1.start(now);
  o1.stop(now + duration);
  const o2 = audioCtx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = freq * 3;
  const g2 = audioCtx.createGain();
  g2.gain.setValueAtTime(0.001, now);
  g2.gain.exponentialRampToValueAtTime(0.08, now + 0.005);
  g2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);
  o2.connect(g2);
  g2.connect(audioCtx.destination);
  o2.start(now);
  o2.stop(now + duration);
}

export const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function pickN(arr, n, must) {
  const pool = arr.filter((x) => x !== must);
  return shuffle([must, ...shuffle(pool).slice(0, n - 1)]);
}
// Découpe un texte en mots "lisibles" (la ponctuation seule rejoint le mot précédent)
export function tokenizeWords(text) {
  const raw = text.match(/\S+/g) || [];
  const merged = [];
  raw.forEach((tok) => {
    if (/^[!?.,;:…]+$/.test(tok) && merged.length) {
      merged[merged.length - 1] += ' ' + tok;
    } else {
      merged.push(tok);
    }
  });
  return merged;
}
// Retire la ponctuation collée à un mot avant de le faire prononcer.
export function spokenText(word) {
  const cleaned = word.replace(/^[!?.,;:…«»"'“”]+|[!?.,;:…«»"'“”]+$/g, '').trim();
  return cleaned || word;
}
