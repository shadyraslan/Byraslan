"use client";

import { useEffect, useState } from "react";
import { PiMoonStarsFill, PiSunFill } from "react-icons/pi";

const THEME_KEY = "by-raslan-dashboard-theme";
type Theme = "light" | "dark" | "image";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let saved: Theme = "light";
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "image") saved = stored;
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
    applyTheme(saved);
    setTheme(saved);
  }, []);

  function applyTheme(value: Theme) {
    document.documentElement.dataset.theme = value;
    console.log(`[ThemeToggle] theme applied → ${value} | data-theme="${document.documentElement.dataset.theme}"`);
  }

  function toggle() {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    console.log(`[ThemeToggle] toggling from "${document.documentElement.dataset.theme}" → "${next}"`);
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Keep the current theme for this session even if it cannot be persisted.
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={theme === "dark"}
      aria-label={theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
      title={theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
    >
      {theme === "dark" ? <PiSunFill aria-hidden /> : <PiMoonStarsFill aria-hidden />}
      <span>تغيير التصميم</span>
    </button>
  );
}
