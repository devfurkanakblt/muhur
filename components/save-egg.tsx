"use client";

import { useEffect, useRef, useState } from "react";

/** Ctrl/Cmd+S alışkanlığına küçük bir cevap. Form alanlarında da çalışır; sayfa kaydetme penceresini engeller. */
export function SaveEgg() {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setShown(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setShown(false), 2400);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const text = "Son push'tan sonra panelde teslim sürümünü güncelle.";
  return (
    <>
      <span role="status" className="sr-only">
        {shown ? text : ""}
      </span>
      <div
        aria-hidden
        data-shown={shown || undefined}
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex translate-y-2 justify-center px-5 opacity-0 transition-[opacity,translate] duration-150 ease-out data-[shown]:translate-y-0 data-[shown]:opacity-100 data-[shown]:duration-200"
      >
        <p className="rounded-[2px] bg-ink px-4 py-2.5 text-[0.9375rem] text-wall">
          {text} Proje bilgilerini değiştirdiysen formdaki kaydet düğmesini kullan.
        </p>
      </div>
    </>
  );
}
