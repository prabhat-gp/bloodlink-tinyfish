"use client";

import { useEffect, useState } from "react";

/** Light / dark switch. The initial class is set before paint by the script in layout.tsx (no flash). */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const flip = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* private mode: still works for this visit */
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-100 hover:text-zinc-900"
    >
      <span className="text-[15px] leading-none transition-transform duration-500" style={{ transform: dark ? "rotate(180deg)" : "none" }}>
        {dark ? "☀" : "☾"}
      </span>
    </button>
  );
}
