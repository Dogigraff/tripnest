import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../../i18n'
import { useSettingsStore } from '../../store/settingsStore'

/** Flag + native name for dropdown rows; keys match `SUPPORTED_LANGUAGES` / locale codes */
const LANGUAGE_DISPLAY: Record<string, { flag: string; native: string }> = {
  en: { flag: '🇬🇧', native: 'English' },
  ru: { flag: '🇷🇺', native: 'Русский' },
  de: { flag: '🇩🇪', native: 'Deutsch' },
  fr: { flag: '🇫🇷', native: 'Français' },
  es: { flag: '🇪🇸', native: 'Español' },
  it: { flag: '🇮🇹', native: 'Italiano' },
  pt: { flag: '🇵🇹', native: 'Português' },
  nl: { flag: '🇳🇱', native: 'Nederlands' },
  pl: { flag: '🇵🇱', native: 'Polski' },
  tr: { flag: '🇹🇷', native: 'Türkçe' },
  zh: { flag: '🇨🇳', native: '中文' },
  ja: { flag: '🇯🇵', native: '日本語' },
  ko: { flag: '🇰🇷', native: '한국어' },
  uk: { flag: '🇺🇦', native: 'Українська' },
  cs: { flag: '🇨🇿', native: 'Čeština' },
  sv: { flag: '🇸🇪', native: 'Svenska' },
  nb: { flag: '🇳🇴', native: 'Norsk' },
  hu: { flag: '🇭🇺', native: 'Magyar' },
  br: { flag: '🇧🇷', native: 'Português (Brasil)' },
  ar: { flag: '🇸🇦', native: 'العربية' },
}

function getDisplay(code: string): { flag: string; native: string } {
  const fromMap = LANGUAGE_DISPLAY[code]
  if (fromMap) return fromMap
  const fromList = SUPPORTED_LANGUAGES.find(l => l.value === code)
  return { flag: '🌐', native: fromList?.label ?? code }
}

interface LanguageSwitcherProps {
  /** `login` = fixed top-right; `navbar` = inline in app header (persists via API) */
  variant?: 'login' | 'navbar'
}

export default function LanguageSwitcher({ variant = 'login' }: LanguageSwitcherProps): React.ReactElement {
  const language = useSettingsStore(s => s.settings.language) || 'en'
  const setLanguageLocal = useSettingsStore(s => s.setLanguageLocal)
  const updateSetting = useSettingsStore(s => s.updateSetting)
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isNavbar = variant === 'navbar'

  const applyLanguage = (code: string) => {
    if (isNavbar) {
      updateSetting('language', code).catch(() => {})
    } else {
      setLanguageLocal(code)
    }
  }

  const updateMenuPos = useCallback(() => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }, [])

  useLayoutEffect(() => {
    if (!open || !isNavbar) return
    updateMenuPos()
    const onResize = () => updateMenuPos()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, isNavbar, updateMenuPos])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (isNavbar) {
        if (buttonRef.current?.contains(t)) return
        if (menuRef.current?.contains(t)) return
        setOpen(false)
        return
      }
      const el = rootRef.current
      if (el && !el.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, isNavbar])

  const current = getDisplay(language)
  const codeLabel = language.toUpperCase()

  const wrapperStyle: React.CSSProperties =
    variant === 'login'
      ? { position: 'absolute', top: 16, right: 16, zIndex: 10 }
      : { position: 'relative', flexShrink: 0 }

  const btnStyle: React.CSSProperties = isNavbar
    ? {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 6px',
        borderRadius: 8,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-secondary)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s',
      }
    : {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 99,
        background: 'rgba(0,0,0,0.06)',
        border: 'none',
        fontSize: 13,
        fontWeight: 500,
        color: '#374151',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s',
      }

  const menuContent = (
    <>
      {SUPPORTED_LANGUAGES.map(opt => {
        const d = getDisplay(opt.value)
        const selected = opt.value === language
        return (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => {
              applyLanguage(opt.value)
              setOpen(false)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              padding: '9px 12px',
              borderRadius: 8,
              border: 'none',
              background: selected
                ? (isNavbar ? 'var(--bg-hover)' : 'rgba(0,0,0,0.06)')
                : 'transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: selected ? 600 : 500,
              color: isNavbar ? 'var(--text-primary)' : '#111827',
            }}
            onMouseEnter={e => {
              if (!selected) e.currentTarget.style.background = isNavbar ? 'var(--bg-hover)' : 'rgba(0,0,0,0.04)'
            }}
            onMouseLeave={e => {
              if (!selected) e.currentTarget.style.background = 'transparent'
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>{d.flag}</span>
            <span>{d.native}</span>
          </button>
        )
      })}
    </>
  )

  const menuPanelStyle: React.CSSProperties = {
    position: isNavbar ? 'fixed' : 'absolute',
    ...(isNavbar
      ? { top: menuPos.top, right: menuPos.right }
      : { top: '100%', right: 0, marginTop: 6 }),
    minWidth: 220,
    maxHeight: 280,
    overflowY: 'auto',
    borderRadius: 12,
    border: isNavbar ? '1px solid var(--border-primary)' : '1px solid rgba(0,0,0,0.08)',
    background: isNavbar ? 'var(--bg-card)' : 'rgba(255,255,255,0.98)',
    boxShadow: isNavbar ? '0 12px 40px rgba(0,0,0,0.25)' : '0 10px 40px rgba(0,0,0,0.12)',
    zIndex: isNavbar ? 10001 : 20,
    padding: 4,
  }

  return (
    <div ref={rootRef} style={wrapperStyle}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={e => {
          e.stopPropagation()
          setOpen(o => !o)
        }}
        style={btnStyle}
        onMouseEnter={e => {
          e.currentTarget.style.background = isNavbar ? 'var(--bg-hover)' : 'rgba(0,0,0,0.1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = isNavbar ? 'var(--bg-card)' : 'rgba(0,0,0,0.06)'
        }}
      >
        <span style={{ lineHeight: 1 }} aria-hidden>{current.flag}</span>
        <span className={isNavbar ? 'hidden sm:inline' : ''} style={{ letterSpacing: '0.02em' }}>{codeLabel}</span>
        <span className={isNavbar ? 'hidden sm:inline' : ''} aria-hidden>
          <ChevronDown size={14} style={{ opacity: 0.65, ...(isNavbar ? { color: 'var(--text-faint)' } : {}) }} />
        </span>
      </button>

      {open && isNavbar && createPortal(
        <div ref={menuRef} role="listbox" style={menuPanelStyle}>
          {menuContent}
        </div>,
        document.body,
      )}

      {open && !isNavbar && (
        <div role="listbox" style={menuPanelStyle}>
          {menuContent}
        </div>
      )}
    </div>
  )
}
