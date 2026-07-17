"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MobileMenu({ children }: Readonly<{ children: React.ReactNode }>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="fixed left-4 top-3 z-50 size-11 md:hidden"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="mobile-workspace-nav"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </Button>
      <aside className="hidden w-[232px] border-r border-border bg-industrial p-4 md:block">
        {children}
      </aside>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            onClick={() => setOpen(false)}
          />
          <aside
            id="mobile-workspace-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-industrial p-4 md:hidden"
          >
            {children}
          </aside>
        </>
      ) : null}
    </>
  );
}
