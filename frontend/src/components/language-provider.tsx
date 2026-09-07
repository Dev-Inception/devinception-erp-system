import { createContext, useContext, useState } from 'react';
import { ACTION_TRANSLATIONS } from '@/lib/translations';

type Language = 'en' | 'ur';

interface LanguageContextValue {
  language: Language;
  setLanguage: (l: Language) => void;
  toggle: () => void;
  /** Translates an action-button label to Urdu when language is 'ur'; falls back to the English text otherwise. */
  t: (text: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const STORAGE_KEY = 'devinception-language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(
    () => (localStorage.getItem(STORAGE_KEY) as Language) || 'en',
  );

  const setLanguage = (l: Language) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLanguageState(l);
  };

  const toggle = () => setLanguage(language === 'en' ? 'ur' : 'en');

  const t = (text: string) => (language === 'ur' ? (ACTION_TRANSLATIONS[text] ?? text) : text);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
