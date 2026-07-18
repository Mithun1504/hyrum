import type { Metadata } from "next";
import { geistMono, geistSans } from "@/lib/fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hyrum",
    template: "%s | Hyrum",
  },
  description: "The ledger of your API's accidental contracts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authEnabled = Boolean(
    process.env.WORKOS_CLIENT_ID &&
      process.env.WORKOS_API_KEY &&
      process.env.WORKOS_COOKIE_PASSWORD &&
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <Providers authEnabled={authEnabled}>{children}</Providers>
      </body>
    </html>
  );
}
