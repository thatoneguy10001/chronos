import { useState, useEffect } from 'react';

const KEY = 'chronos_dev_mode';

export function useDevMode() {
  const [devMode, setDevMode] = useState(() => localStorage.getItem(KEY) === '1');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setDevMode(prev => {
          const next = !prev;
          localStorage.setItem(KEY, next ? '1' : '0');
          return next;
        });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return devMode;
}
