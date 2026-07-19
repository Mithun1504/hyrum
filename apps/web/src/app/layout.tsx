import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

const themeBootScript = `(() => {
  try {
    const stored = localStorage.getItem("theme");
    const theme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
})();`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script>{themeBootScript}</script>
      </head>
      <body>
        <Providers authEnabled={authEnabled}>{children}</Providers>
      </body>
    </html>
  );
}
