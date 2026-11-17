import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FlixfilLogo } from './FlixfilLogo';

interface LoadingScreenProps {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = prefersReduced ? 350 : 1150;

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 300);
    }, delay);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#080808] px-6"
          role="status"
          aria-label="Memuat FLIXFIL"
        >
          <div className="relative flex flex-col items-center">
            <div
              className="pointer-events-none absolute -inset-16 rounded-full opacity-40 blur-3xl"
              style={{
                background: 'radial-gradient(circle, rgba(255,22,61,0.42) 0%, rgba(139,0,31,0.12) 55%, transparent 75%)',
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <FlixfilLogo size="xl" />
            </motion.div>
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.65, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 h-[2px] w-48 origin-center neon-line-sweep"
            />
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.25 }}
              className="mt-3 text-xs tracking-[0.22em] text-zinc-400 uppercase"
            >
              Your Story. Your Screen.
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
