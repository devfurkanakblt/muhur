export const BRAND = "mühür";
export const TAGLINE = "Süre dolar, mühür vurulur.";

/** "mühür." — noktası indigo, tıpkı kilit anındaki "Mühürlendi." gibi. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-[-0.035em] ${className}`}>
      {BRAND}
      <span className="text-indigo">.</span>
    </span>
  );
}
