"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AccountControls({ label }: { label: string }) {
  const { signOut } = useAuth();
  const [pending, setPending] = useState(false);

  return (
    <div className="grid gap-2">
      <b className="truncate text-foreground" title={label}>
        {label}
      </b>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="w-fit px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await signOut();
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
