"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
const themeChangeEvent = "hyrum:theme-change";

function subscribeToTheme(callback: () => void) {
  window.addEventListener(themeChangeEvent, callback);
  return () => window.removeEventListener(themeChangeEvent, callback);
}

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("theme", theme);
  window.dispatchEvent(new Event(themeChangeEvent));
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const dark = theme === "dark";
  const nextTheme = dark ? "light" : "dark";
  const actionLabel = `Switch to ${nextTheme} theme`;

  function toggleTheme() {
    applyTheme(nextTheme);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "xs" : "sm"}
      className="w-fit justify-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      aria-label={actionLabel}
      title={actionLabel}
      onClick={toggleTheme}
    >
      Theme: {theme}
    </Button>
  );
}
