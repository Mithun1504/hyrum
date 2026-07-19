import type { Metadata } from "next";
import { siteDescription, siteName, siteUrl } from "@/lib/site";
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
  metadataBase: siteUrl,
  title: {
    default: siteName,
    template: "%s | Hyrum",
  },
  description: siteDescription,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName,
    title: siteName,
    description: siteDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: siteDescription }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: ["/opengraph-image"],
  },
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
    <html lang="en" className="scroll-pt-16" suppressHydrationWarning>
      <head>
        <script>{themeBootScript}</script>
      </head>
      <body>
        <Providers authEnabled={authEnabled}>{children}</Providers>
      </body>
    </html>
  );
}
