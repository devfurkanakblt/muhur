import { Game } from "@/components/game";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="shell">
      <header className="site-header">
        <a href="/" className="wordmark" aria-label="Ben kimim? ana ekran">
          ben kimim<span className="mark">?</span>
        </a>
        <span className="header-meta">DEÜ CS&amp;AI · EkoZeka</span>
        <ThemeToggle />
      </header>
      <main id="main-content">
        <Game />
      </main>
      <footer className="site-footer">
        <p>
          <strong>DEÜ CS&amp;AI</strong> · Düşün, Bağlan, Üret.
        </p>
        <p className="muted">
          EkoZeka Hackathon, 7–8 Kasım 2026 · <a href="/kaynaklar">Fotoğraf kaynakları</a>
        </p>
      </footer>
    </div>
  );
}
