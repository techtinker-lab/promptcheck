import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import pt from '../locales/pt.json';

const savedLang = localStorage.getItem('promptcheck_lang');
const browserLang = navigator.language.startsWith('pt') ? 'pt' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pt: { translation: pt },
  },
  lng: savedLang || browserLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export function changeLanguage(lang: 'en' | 'pt') {
  i18n.changeLanguage(lang);
  localStorage.setItem('promptcheck_lang', lang);
}

export default i18n;
