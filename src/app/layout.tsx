import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz"], display: "swap" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "BloodLink: find blood in an emergency",
  description: "Live blood stock from eRaktKosh for all 31 districts of Karnataka, read in seconds by a TinyFish browser. Who has your blood group, who to call first.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
