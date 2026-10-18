import Link from "next/link";
import { ArrowUpRightIcon, LockSimpleIcon } from "@phosphor-icons/react/ssr";
import type { Exhibit } from "@/lib/data";
import { exhibitNo } from "@/lib/format";

/** Tüm logolar aynı ölçekte, aynı kaide üzerinde durur. */
export function Plinth({ src, alt, size = "md" }: { src: string | null; alt: string; size?: "md" | "lg" }) {
  return (
    <div
      className={`grid aspect-square place-items-center border border-rule bg-plinth ${size === "lg" ? "w-full max-w-[220px]" : "w-full"}`}
    >
      {src ? (
        // Logolar kullanıcı yüklemesi; boyutları bilinmediği için düz img.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-[46%] w-[46%] object-contain" loading="lazy" />
      ) : (
        <span className="text-sm text-ink-3">Logo yok</span>
      )}
    </div>
  );
}

export function ExhibitLabel({
  exhibit,
  logo,
  locked,
  sealSlot,
  href,
  pulse,
  awards,
  extra,
}: {
  exhibit: Pick<Exhibit, "exhibit_no" | "name" | "team_name" | "summary" | "repo_full_name" | "repo_url" | "frozen_sha" | "freeze_error" | "archive_sha256" | "accepted_sha">;
  logo: string | null;
  locked: boolean;
  sealSlot?: React.ReactNode;
  /** Eser sayfası; verilirse ad bağlantı olur. */
  href?: string;
  /** "son push 4 dk önce" gibi canlı nabız satırı. */
  pulse?: string | null;
  /** Ödül rozetleri; adın altında durur, kaideler sırada hizalı kalır. */
  awards?: React.ReactNode;
  /** Oy düğmesi ya da oy sayısı. */
  extra?: React.ReactNode;
}) {
  return (
    <article className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-5 min-[480px]:flex min-[480px]:flex-col">
      <div className="row-span-6">
        <Plinth src={logo} alt={`${exhibit.name} logosu`} />
      </div>
      <h3 className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] min-[480px]:mt-5">
        {href ? (
          <Link href={href} className="hover:underline">
            {exhibit.name}
          </Link>
        ) : (
          exhibit.name
        )}
      </h3>
      <p className="text-[0.9375rem] text-ink-2">{exhibit.team_name}</p>
      {awards && <div className="col-start-2 mt-3">{awards}</div>}
      <p className="mt-3 line-clamp-4 text-[0.875rem] leading-relaxed text-ink-2">{exhibit.summary}</p>
      <div className="col-start-2 mt-4 flex flex-col items-start gap-1 font-mono text-[0.75rem]">
        <span className="text-ink-3 tnum">{exhibitNo(exhibit.exhibit_no)}</span>
        <a href={exhibit.repo_url} target="_blank" rel="noreferrer" className="break-all text-ink-2 hover:text-ink">
          {exhibit.repo_full_name}
          <ArrowUpRightIcon size={12} className="ml-1 inline align-[-1px]" />
        </a>
      </div>
      {sealSlot ?? (locked && (exhibit.freeze_error || (!exhibit.archive_sha256 && !exhibit.accepted_sha)
        ? <p className="col-start-2 mt-3 text-[0.75rem] text-danger">Teslim veya arşivleme sorunu</p>
        : <Seal sha={exhibit.archive_sha256 ? exhibit.frozen_sha : null} repoUrl={exhibit.repo_url} />))}
      {!locked && pulse && (
        <p className="col-start-2 mt-3 inline-flex items-center gap-2 text-[0.8125rem] text-ink-3">
          <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-ink-3" />
          {pulse}
        </p>
      )}
      {extra && <div className="col-start-2 mt-4">{extra}</div>}
    </article>
  );
}

export function Seal({ sha, repoUrl }: { sha: string | null; repoUrl: string }) {
  if (!sha) {
    return (
      <p className="col-start-2 mt-3 inline-flex items-center gap-1.5 font-mono text-[0.75rem] text-indigo">
        <LockSimpleIcon size={12} weight="bold" />
        Mühürleniyor…
      </p>
    );
  }
  return (
    <a
      href={`${repoUrl}/tree/${sha}`}
      target="_blank"
      rel="noreferrer"
      className="col-start-2 mt-3 inline-flex items-center gap-1.5 self-start font-mono text-[0.75rem] text-indigo hover:text-indigo-ink"
      title={sha}
    >
      <LockSimpleIcon size={12} weight="bold" />
      Mühür {sha.slice(0, 7)}
    </a>
  );
}
