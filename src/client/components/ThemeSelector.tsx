import { useEffect, useRef, useState } from 'react';
import { THEMES, type ThemeId } from '../theme';
import { PaletteIcon } from './icons';

export function ThemeSelector({ theme, onChange }: { theme: ThemeId; onChange: (theme: ThemeId) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="theme-selector" ref={wrapRef}>
      <button
        type="button"
        className="icon-button theme-trigger"
        aria-label="Skift farver"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <PaletteIcon size={20} />
      </button>

      {open && (
        <div className="theme-menu" role="menu">
          {THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === option.id}
              className={`theme-option ${theme === option.id ? 'selected' : ''}`}
              onClick={() => { onChange(option.id); setOpen(false); }}
            >
              <span className="theme-swatch" style={{ background: option.swatch[0] }}>
                <i style={{ background: option.swatch[1] }} />
                <i style={{ background: option.swatch[2] }} />
              </span>
              <span className="theme-option-text">
                <strong>{option.name}</strong>
                <small>{option.mood}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
