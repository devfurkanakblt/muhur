import type { Metadata } from "next";
import { DECK } from "@/lib/deck";
import credits from "@/lib/credits.json";

export const metadata: Metadata = { title: "Fotoğraf kaynakları · Ben kimim?" };

type Credit = { author: string; license: string; source: string };

export default function Kaynaklar() {
  const list = credits as Record<string, Credit>;
  return (
    <div className="shell">
      <header className="site-header">
        <a href="/" className="wordmark">
          ben kimim<span className="mark">?</span>
        </a>
      </header>
      <main>
        <h1 className="page-title">Fotoğraf kaynakları</h1>
        <p className="lede">
          Bütün fotoğraflar Wikimedia Commons&apos;tan, serbest lisanslarla (CC0, kamu malı, CC BY, CC BY-SA) alındı ve
          boyutları küçültüldü. Her fotoğrafın sahibi ve lisansı aşağıda.
        </p>
        <div className="section-head">
          <h2>Kartlar</h2>
          <span className="muted tnum">{DECK.length} fotoğraf</span>
        </div>
        <ol className="credits">
          {DECK.map((e) => {
            const c = list[e.id];
            if (!c) return null;
            return (
              <li key={e.id}>
                <strong>{e.name}</strong>
                <span>
                  {c.author} · {c.license} ·{" "}
                  <a href={c.source} rel="noopener noreferrer">
                    Commons
                  </a>
                </span>
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
