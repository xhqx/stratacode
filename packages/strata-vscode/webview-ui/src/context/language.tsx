/**
 * Language context
 * Provides i18n translations for strata-ui components.
 * Merges UI translations from @opencode-ai/ui and Strata overrides from @stratacode/strata-i18n.
 *
 * Locale priority: user override → VS Code display language → browser language → "en"
 */

import { createSignal, createMemo, createEffect, ParentComponent, Accessor } from "solid-js"
import { I18nProvider } from "@stratacode/strata-ui/context"
import type { UiI18nKey, UiI18nParams } from "@stratacode/strata-ui/context"
import { dict as uiEn } from "@stratacode/strata-ui/i18n/en"
import { dict as uiZh } from "@stratacode/strata-ui/i18n/zh"
import { dict as uiZht } from "@stratacode/strata-ui/i18n/zht"
import { dict as uiKo } from "@stratacode/strata-ui/i18n/ko"
import { dict as uiDe } from "@stratacode/strata-ui/i18n/de"
import { dict as uiEs } from "@stratacode/strata-ui/i18n/es"
import { dict as uiFr } from "@stratacode/strata-ui/i18n/fr"
import { dict as uiDa } from "@stratacode/strata-ui/i18n/da"
import { dict as uiJa } from "@stratacode/strata-ui/i18n/ja"
import { dict as uiPl } from "@stratacode/strata-ui/i18n/pl"
import { dict as uiRu } from "@stratacode/strata-ui/i18n/ru"
import { dict as uiAr } from "@stratacode/strata-ui/i18n/ar"
import { dict as uiNo } from "@stratacode/strata-ui/i18n/no"
import { dict as uiBr } from "@stratacode/strata-ui/i18n/br"
import { dict as uiTh } from "@stratacode/strata-ui/i18n/th"
import { dict as uiBs } from "@stratacode/strata-ui/i18n/bs"
import { dict as uiTr } from "@stratacode/strata-ui/i18n/tr"
import { dict as uiNl } from "@stratacode/strata-ui/i18n/nl"
import { dict as uiUk } from "@stratacode/strata-ui/i18n/uk"
import { dict as appEn } from "../i18n/en"
import { dict as appZh } from "../i18n/zh"
import { dict as appZht } from "../i18n/zht"
import { dict as appKo } from "../i18n/ko"
import { dict as appDe } from "../i18n/de"
import { dict as appEs } from "../i18n/es"
import { dict as appFr } from "../i18n/fr"
import { dict as appDa } from "../i18n/da"
import { dict as appJa } from "../i18n/ja"
import { dict as appPl } from "../i18n/pl"
import { dict as appRu } from "../i18n/ru"
import { dict as appAr } from "../i18n/ar"
import { dict as appNo } from "../i18n/no"
import { dict as appBr } from "../i18n/br"
import { dict as appTh } from "../i18n/th"
import { dict as appBs } from "../i18n/bs"
import { dict as appTr } from "../i18n/tr"
import { dict as appNl } from "../i18n/nl"
import { dict as appUk } from "../i18n/uk"
import { dict as amEn } from "../../agent-manager/i18n/en"
import { dict as amZh } from "../../agent-manager/i18n/zh"
import { dict as amZht } from "../../agent-manager/i18n/zht"
import { dict as amKo } from "../../agent-manager/i18n/ko"
import { dict as amDe } from "../../agent-manager/i18n/de"
import { dict as amEs } from "../../agent-manager/i18n/es"
import { dict as amFr } from "../../agent-manager/i18n/fr"
import { dict as amDa } from "../../agent-manager/i18n/da"
import { dict as amJa } from "../../agent-manager/i18n/ja"
import { dict as amPl } from "../../agent-manager/i18n/pl"
import { dict as amRu } from "../../agent-manager/i18n/ru"
import { dict as amAr } from "../../agent-manager/i18n/ar"
import { dict as amNo } from "../../agent-manager/i18n/no"
import { dict as amBr } from "../../agent-manager/i18n/br"
import { dict as amTh } from "../../agent-manager/i18n/th"
import { dict as amBs } from "../../agent-manager/i18n/bs"
import { dict as amTr } from "../../agent-manager/i18n/tr"
import { dict as amNl } from "../../agent-manager/i18n/nl"
import { dict as amUk } from "../../agent-manager/i18n/uk"
import { dict as strataEn } from "@stratacode/strata-i18n/en"
import { dict as strataZh } from "@stratacode/strata-i18n/zh"
import { dict as strataZht } from "@stratacode/strata-i18n/zht"
import { dict as strataKo } from "@stratacode/strata-i18n/ko"
import { dict as strataDe } from "@stratacode/strata-i18n/de"
import { dict as strataEs } from "@stratacode/strata-i18n/es"
import { dict as strataFr } from "@stratacode/strata-i18n/fr"
import { dict as strataDa } from "@stratacode/strata-i18n/da"
import { dict as strataJa } from "@stratacode/strata-i18n/ja"
import { dict as strataPl } from "@stratacode/strata-i18n/pl"
import { dict as strataRu } from "@stratacode/strata-i18n/ru"
import { dict as strataAr } from "@stratacode/strata-i18n/ar"
import { dict as strataNo } from "@stratacode/strata-i18n/no"
import { dict as strataBr } from "@stratacode/strata-i18n/br"
import { dict as strataTh } from "@stratacode/strata-i18n/th"
import { dict as strataBs } from "@stratacode/strata-i18n/bs"
import { dict as strataTr } from "@stratacode/strata-i18n/tr"
import { dict as strataNl } from "@stratacode/strata-i18n/nl"
import { dict as strataUk } from "@stratacode/strata-i18n/uk"
import { useVSCode } from "./vscode"
import { normalizeLocale as _normalizeLocale, resolveTemplate as _resolveTemplate } from "./language-utils"

export type { Locale } from "./language-utils"
export { LOCALES } from "./language-utils"
import type { Locale } from "./language-utils"
import { LOCALES, RTL_LOCALES, localeToBcp47 } from "./language-utils"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
  zht: "繁體中文",
  ko: "한국어",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  da: "Dansk",
  ja: "日本語",
  pl: "Polski",
  ru: "Русский",
  ar: "العربية",
  no: "Norsk",
  br: "Português (Brasil)",
  th: "ภาษาไทย",
  bs: "Bosanski",
  tr: "Türkçe",
  nl: "Nederlands",
  uk: "Українська",
}

// Merge 4 dict layers: app + ui + strata + agent manager (strata and agent manager override last)
const base = { ...appEn, ...uiEn, ...strataEn }
const dicts: Record<Locale, Record<string, string>> = {
  en: { ...base, ...amEn },
  zh: { ...base, ...appZh, ...uiZh, ...strataZh, ...amEn, ...amZh },
  zht: { ...base, ...appZht, ...uiZht, ...strataZht, ...amEn, ...amZht },
  ko: { ...base, ...appKo, ...uiKo, ...strataKo, ...amEn, ...amKo },
  de: { ...base, ...appDe, ...uiDe, ...strataDe, ...amEn, ...amDe },
  es: { ...base, ...appEs, ...uiEs, ...strataEs, ...amEn, ...amEs },
  fr: { ...base, ...appFr, ...uiFr, ...strataFr, ...amEn, ...amFr },
  da: { ...base, ...appDa, ...uiDa, ...strataDa, ...amEn, ...amDa },
  ja: { ...base, ...appJa, ...uiJa, ...strataJa, ...amEn, ...amJa },
  pl: { ...base, ...appPl, ...uiPl, ...strataPl, ...amEn, ...amPl },
  ru: { ...base, ...appRu, ...uiRu, ...strataRu, ...amEn, ...amRu },
  ar: { ...base, ...appAr, ...uiAr, ...strataAr, ...amEn, ...amAr },
  no: { ...base, ...appNo, ...uiNo, ...strataNo, ...amEn, ...amNo },
  br: { ...base, ...appBr, ...uiBr, ...strataBr, ...amEn, ...amBr },
  th: { ...base, ...appTh, ...uiTh, ...strataTh, ...amEn, ...amTh },
  bs: { ...base, ...appBs, ...uiBs, ...strataBs, ...amEn, ...amBs },
  tr: { ...base, ...appTr, ...uiTr, ...strataTr, ...amEn, ...amTr },
  nl: { ...base, ...appNl, ...uiNl, ...strataNl, ...amEn, ...amNl },
  uk: { ...base, ...appUk, ...uiUk, ...strataUk, ...amEn, ...amUk },
}

function normalizeLocale(lang: string): Locale {
  return _normalizeLocale(lang)
}

function resolveTemplate(text: string, params?: UiI18nParams) {
  return _resolveTemplate(text, params as Record<string, string | number | boolean | undefined>)
}

interface LanguageProviderProps {
  vscodeLanguage?: Accessor<string | undefined>
  languageOverride?: Accessor<string | undefined>
}

export const LanguageProvider: ParentComponent<LanguageProviderProps> = (props) => {
  const vscode = useVSCode()
  const [userOverride, setUserOverride] = createSignal<Locale | "">("")

  // Initialize from extension-side override
  createEffect(() => {
    const override = props.languageOverride?.()
    if (override) {
      setUserOverride(normalizeLocale(override))
    }
  })

  // Resolved locale: user override → VS Code language → browser language → "en"
  const locale = createMemo<Locale>(() => {
    const override = userOverride()
    if (override) {
      return override
    }
    const vscodeLang = props.vscodeLanguage?.()
    if (vscodeLang) {
      return normalizeLocale(vscodeLang)
    }
    if (typeof navigator !== "undefined" && navigator.language) {
      return normalizeLocale(navigator.language)
    }
    return "en"
  })

  const dict = createMemo(() => dicts[locale()] ?? dicts.en)

  // Update <html lang> and <html dir> when locale changes
  createEffect(() => {
    const loc = locale()
    document.documentElement.lang = localeToBcp47(loc)
    document.documentElement.dir = RTL_LOCALES.has(loc) ? "rtl" : "ltr"
  })

  const t = (key: UiI18nKey, params?: UiI18nParams) => {
    const text = (dict() as Record<string, string>)[key] ?? String(key)
    return resolveTemplate(text, params)
  }

  const setLocale = (next: Locale | "") => {
    setUserOverride(next)
    vscode.postMessage({ type: "setLanguage", locale: next })
  }

  return (
    <LanguageContext.Provider
      value={{ locale, setLocale, userOverride, t: t as (key: string, params?: UiI18nParams) => string }}
    >
      <I18nProvider value={{ locale: () => locale(), t }}>{props.children}</I18nProvider>
    </LanguageContext.Provider>
  )
}

// Expose locale + setLocale for the LanguageTab
import { createContext, useContext } from "solid-js"

export interface LanguageContextValue {
  locale: Accessor<Locale>
  setLocale: (locale: Locale | "") => void
  userOverride: Accessor<Locale | "">
  t: (key: string, params?: UiI18nParams) => string
}

export const LanguageContext = createContext<LanguageContextValue>()

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return ctx
}
