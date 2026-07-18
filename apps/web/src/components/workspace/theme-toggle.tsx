"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const dark = mounted && resolvedTheme === "dark";
  const nextTheme = dark ? "light" : "dark";
  const actionLabel = mounted ? `Switch to ${nextTheme} theme` : "Change theme";

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "xs" : "sm"}
      className="w-fit justify-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      aria-label={actionLabel}
      title={actionLabel}
      onClick={() => setTheme(nextTheme)}
    >
      Theme: {mounted ? (dark ? "dark" : "light") : "…"}
    </Button>
  );
}
