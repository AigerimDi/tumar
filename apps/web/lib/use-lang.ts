"use client";

import { useEffect, useState } from "react";
import type { Lang } from "./i18n";

const EVENT = "tumar:lang-change";

function read(): Lang {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem("tumar:lang");
  return v === "en" || v === "ru" || v === "kz" ? v : "en";
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(read());
    const onChange = () => setLangState(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tumar:lang", l);
      window.dispatchEvent(new Event(EVENT));
    }
  };

  return [lang, setLang];
}
