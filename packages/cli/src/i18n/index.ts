import { type Locale, type TranslationKey, translations } from './translations.js';

let currentLocale: Locale = 'en';

/**
 * Detecta o idioma preferencial do sistema operacional ou env
 */
export function detectSystemLocale(): Locale {
  const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL;
  if (envLang && /^pt/i.test(envLang)) {
    return 'pt';
  }

  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (/^pt/i.test(intlLocale)) {
      return 'pt';
    }
  } catch {
    // Fallback silencioso para inglês
  }

  return 'en';
}

/**
 * Define o idioma ativo na CLI
 */
export function setLocale(locale?: string): void {
  if (locale && (locale === 'pt' || locale === 'pt-BR')) {
    currentLocale = 'pt';
  } else if (locale && (locale === 'en' || locale === 'en-US')) {
    currentLocale = 'en';
  } else {
    currentLocale = detectSystemLocale();
  }
}

/**
 * Retorna a mensagem traduzida interpolando variáveis {chave}
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const dict = translations[currentLocale] || translations.en;
  let message: string = (dict as Record<string, string>)[key] || translations.en[key] || key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return message;
}
