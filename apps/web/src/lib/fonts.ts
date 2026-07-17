import { Archivo, JetBrains_Mono } from "next/font/google";

export const geistSans = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-geist-sans",
});

export const geistMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-geist-mono",
});
