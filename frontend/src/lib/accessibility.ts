/**
 * Accessibility utilities for WCAG 2.1 AA compliance
 * Contrast checking, focus management, keyboard navigation, screen reader support
 */

// WCAG 2.1 AA contrast ratios
export const CONTRAST_RATIOS = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3,
  AAA_NORMAL: 7,
  AAA_LARGE: 4.5,
} as const;

// Convert hex to RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Relative luminance per WCAG
function luminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

// Contrast ratio between two colors
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return 1;

  const l1 = luminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = luminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Check if contrast passes WCAG level
export function checkContrast(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  largeText = false
): { ratio: number; passes: boolean; level: string } {
  const ratio = getContrastRatio(foreground, background);
  const required = level === 'AA'
    ? (largeText ? CONTRAST_RATIOS.AA_LARGE : CONTRAST_RATIOS.AA_NORMAL)
    : (largeText ? CONTRAST_RATIOS.AAA_LARGE : CONTRAST_RATIOS.AAA_NORMAL);

  return {
    ratio: Math.round(ratio * 100) / 100,
    passes: ratio >= required,
    level: `${level}${largeText ? ' Large' : ''}`,
  };
}

// Color palette with guaranteed contrast
export const ACCESSIBLE_COLORS = {
  // Dark theme (current)
  dark: {
    background: '#020617',      // slate-950
    surface: '#0f172a',         // slate-900
    surfaceElevated: '#1e293b', // slate-800
    border: '#334155',          // slate-700
    textPrimary: '#f1f5f9',     // slate-100
    textSecondary: '#94a3b8',   // slate-400
    textMuted: '#64748b',       // slate-500
    accent: '#6366f1',          // indigo-500
    accentHover: '#818cf8',     // indigo-400
    success: '#10b981',         // emerald-500
    warning: '#f59e0b',         // amber-500
    error: '#ef4444',           // red-500
    focus: '#6366f1',           // indigo-500
  },
  // Light theme
  light: {
    background: '#f8fafc',      // slate-50
    surface: '#ffffff',         // white
    surfaceElevated: '#f1f5f9', // slate-100
    border: '#e2e8f0',          // slate-200
    textPrimary: '#0f172a',     // slate-900
    textSecondary: '#475569',   // slate-600
    textMuted: '#94a3b8',       // slate-400
    accent: '#4f46e5',          // indigo-600
    accentHover: '#4338ca',     // indigo-700
    success: '#059669',         // emerald-600
    warning: '#d97706',         // amber-600
    error: '#dc2626',           // red-600
    focus: '#4f46e5',           // indigo-600
  },
} as const;

// Validate color combinations
export function validateColorScheme() {
  const results: Record<string, { ratio: number; passes: boolean }> = {};

  for (const [themeName, theme] of Object.entries(ACCESSIBLE_COLORS)) {
    results[`${themeName}.textOnBackground`] = checkContrast(theme.textPrimary, theme.background);
    results[`${themeName}.textOnSurface`] = checkContrast(theme.textPrimary, theme.surface);
    results[`${themeName}.secondaryOnBackground`] = checkContrast(theme.textSecondary, theme.background);
    results[`${themeName}.accentOnBackground`] = checkContrast(theme.accent, theme.background);
    results[`${themeName}.errorOnBackground`] = checkContrast(theme.error, theme.background);
    results[`${themeName}.successOnBackground`] = checkContrast(theme.success, theme.background);
    results[`${themeName}.borderOnSurface`] = checkContrast(theme.border, theme.surface, 'AA', true);
  }

  return results;
}

// Focus management
export function trapFocus(element: HTMLElement) {
  const focusableElements = element.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  function handleTab(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  element.addEventListener('keydown', handleTab);
  firstElement?.focus();

  return () => element.removeEventListener('keydown', handleTab);
}

// Announce to screen readers
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcer = document.getElementById('a11y-announcer') || createAnnouncer();
  announcer.setAttribute('aria-live', priority);
  announcer.textContent = message;
}

function createAnnouncer() {
  const div = document.createElement('div');
  div.id = 'a11y-announcer';
  div.setAttribute('role', 'status');
  div.setAttribute('aria-live', 'polite');
  div.style.position = 'absolute';
  div.style.width = '1px';
  div.style.height = '1px';
  div.style.padding = '0';
  div.style.margin = '-1px';
  div.style.overflow = 'hidden';
  div.style.clip = 'rect(0, 0, 0, 0)';
  div.style.whiteSpace = 'nowrap';
  div.style.border = '0';
  document.body.appendChild(div);
  return div;
}

// Keyboard navigation helpers
export const KEYS = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
} as const;

export function handleArrowNavigation(
  e: React.KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number,
  onChange: (index: number) => void,
  circular = true
) {
  let newIndex = currentIndex;

  switch (e.key) {
    case KEYS.ARROW_DOWN:
    case KEYS.ARROW_RIGHT:
      e.preventDefault();
      newIndex = currentIndex + 1;
      break;
    case KEYS.ARROW_UP:
    case KEYS.ARROW_LEFT:
      e.preventDefault();
      newIndex = currentIndex - 1;
      break;
    case KEYS.HOME:
      e.preventDefault();
      newIndex = 0;
      break;
    case KEYS.END:
      e.preventDefault();
      newIndex = items.length - 1;
      break;
    default:
      return;
  }

  if (circular) {
    newIndex = (newIndex + items.length) % items.length;
  } else {
    newIndex = Math.max(0, Math.min(newIndex, items.length - 1));
  }

  onChange(newIndex);
  items[newIndex]?.focus();
}

// Skip link component helper
export function createSkipLink(targetId: string, label = 'Saltar al contenido principal') {
  const link = document.createElement('a');
  link.href = `#${targetId}`;
  link.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-xl focus:font-medium';
  link.textContent = label;
  return link;
}

// Reduced motion detection
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// High contrast detection
export function prefersHighContrast(): boolean {
  return window.matchMedia('(prefers-contrast: more)').matches;
}

// Color scheme detection
export function getColorScheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Alt text generator for common UI elements
export const ALT_TEXTS = {
  logo: 'LifeAgente AI - Tu asistente personal con IA',
  close: 'Cerrar',
  menu: 'Abrir menú',
  search: 'Buscar',
  settings: 'Ajustes',
  profile: 'Perfil de usuario',
  notifications: 'Notificaciones',
  logout: 'Cerrar sesión',
  login: 'Iniciar sesión',
  register: 'Registrarse',
  save: 'Guardar cambios',
  delete: 'Eliminar',
  edit: 'Editar',
  add: 'Añadir',
  expand: 'Expandir',
  collapse: 'Colapsar',
  previous: 'Anterior',
  next: 'Siguiente',
  loading: 'Cargando',
  error: 'Error',
  success: 'Éxito',
  warning: 'Advertencia',
  info: 'Información',
  calendar: 'Calendario',
  task: 'Tarea',
  note: 'Nota',
  expense: 'Gasto',
  chat: 'Chat con IA',
  panel: 'Panel',
  sync: 'Sincronizar',
  backup: 'Respaldo',
  export: 'Exportar',
  import: 'Importar',
} as const;

// ARIA label helpers
export function ariaLabel(base: string, context?: string): string {
  return context ? `${base}, ${context}` : base;
}

export function ariaDescribedBy(...ids: string[]): string {
  return ids.filter(Boolean).join(' ');
}

// Live region hook for React
export function useAnnouncer() {
  return (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    announce(message, priority);
  };
}

// Focus restoration hook
export function useFocusRestore() {
  const savedRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    savedRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    savedRef.current?.focus();
    savedRef.current = null;
  }, []);

  return { saveFocus, restoreFocus };
}

// Need to import React hooks
import { useRef, useCallback } from 'react';