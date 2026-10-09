"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { buttonStyles } from "@/components/button-styles";

type Repo = { id: number; full_name: string; description: string | null; pushed: string; taken: boolean };

export function RepoPicker({ repos, error }: { repos: Repo[]; error?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : repos;
  }, [repos, query]);

  const choose = (fullName: string) => router.push(`/panel?repo=${encodeURIComponent(fullName)}`);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Repo ara</span>
        <MagnifyingGlassIcon size={18} className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Repo ara"
          className="h-12 w-full border-b border-rule-strong bg-transparent pl-7 text-[1rem] placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
      </label>

      {error && <p className="mt-4 text-[0.9375rem] text-danger">{error}</p>}

      <ul className="mt-2 divide-y divide-rule">
        {filtered.length === 0 && (
          <li className="py-8 text-ink-2">
            {repos.length === 0 ? "Hesabında public repo bulunamadı." : "Aramana uyan repo yok."}
          </li>
        )}
        {filtered.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="break-all font-medium">{r.full_name}</p>
              <p className="truncate text-[0.875rem] text-ink-3">
                {r.taken ? "Başka bir ekip içe aktardı" : (r.description ?? "Açıklama yok")} · {r.pushed}
              </p>
            </div>
            <button
              type="button"
              disabled={r.taken}
              onClick={() => choose(r.full_name)}
              className={`${buttonStyles.ghost} h-10 shrink-0 px-4`}
            >
              Repo seç
            </button>
          </li>
        ))}
      </ul>

      <form
        className="mt-10 border-t border-rule pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (paste.trim()) choose(paste.trim());
        }}
      >
        <label htmlFor="paste" className="text-[0.9375rem] text-ink-2">
          Listede yok mu? Organizasyondaki bir reponun bağlantısını yapıştır.
        </label>
        <div className="mt-3 flex gap-3">
          <input
            id="paste"
            required
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="github.com/ekip/proje"
            className="h-11 min-w-0 flex-1 rounded-[2px] border border-rule-strong bg-plinth px-3 font-mono text-[1rem] placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
          <button type="submit" className={`${buttonStyles.ghost} h-11 px-4`}>
            Devam
          </button>
        </div>
      </form>
    </div>
  );
}
