import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BloodLink: find blood in an emergency",
  description: "TinyFish agents search eRaktKosh for live blood stock across blood banks in about 60 seconds.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
