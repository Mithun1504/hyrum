"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({
  children,
  authEnabled,
}: Readonly<{ children: React.ReactNode; authEnabled: boolean }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const content = (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );

  return authEnabled ? <AuthKitProvider>{content}</AuthKitProvider> : content;
}
