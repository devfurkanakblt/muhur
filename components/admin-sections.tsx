import { SignInButton } from "@/components/buttons";
import { RetryJobButton } from "@/components/admin-forms";
import type { AdminSession } from "@/lib/data";
import { formatDateTime, formatTime } from "@/lib/format";

/** Yönetim sayfalarının bölüm düzeni: solda başlık ve not, sağda içerik. */
export function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-ink pt-6 md:grid-cols-[260px_1fr] md:gap-12">
      <div>
        <h2 className="text-[1.125rem] font-semibold">{title}</h2>
        {note && <p className="mt-2 text-[0.9375rem] text-ink-2">{note}</p>}
      </div>
      <div className="min-w-0 max-w-[680px]">{children}</div>
    </section>
  );
}

/**
 * Geri alınamaz işlemler için oturum tazeliği (A21): süresi dolmadan önce uyarır, dolunca yeniden giriş ister.
 * `actions` sayfadaki işlemleri sayar ("Kilit, zamanlama, oylama ve askı"); `next` yeniden girişten sonra dönülecek adrestir.
 */
export function SessionNotice({ session, now, actions, next }: { session: AdminSession | null; now: number; actions: string; next: string }) {
  const until = session?.freshUntil ?? null;
  const at = until ? formatDateTime(new Date(until).toISOString()) : null;
  const reauth = <SignInButton next={next} label="GitHub ile yeniden giriş yap" />;
  if (!session?.fresh) {
    return (
      <div role="alert" className="grid gap-4 border-y border-danger/40 py-5">
        <p className="max-w-[70ch]">
          <span className="font-medium">{actions} kapalı.</span>{" "}
          <span className="text-ink-2">Bu işlemler son 12 saat içinde açılmış bir oturum ister. Yeniden giriş yapınca hemen açılır.</span>
        </p>
        <div>{reauth}</div>
      </div>
    );
  }
  const soon = until !== null && until - now < 3 * 3600_000;
  return (
    <div className="grid gap-4 text-[0.9375rem] text-ink-2">
      <p>{actions} {at} itibarıyla yeniden giriş isteyecek.</p>
      {soon && <div><p className="mb-3 text-ink">Süre üç saatten az; kritik bir anda kapanmaması için şimdi yeniden giriş yap.</p>{reauth}</div>}
    </div>
  );
}

export type DeliveryJobRow = {
  id: string;
  kind: string;
  state: string;
  attempts: number;
  error: string | null;
  next_attempt_at: string;
  project: unknown;
  event?: unknown;
};

const JOB_STATE: Record<string, string> = { queued: "Sırada", processing: "İşleniyor", completed: "Tamamlandı", failed: "Başarısız" };

/** Teslim işleri listesi; platform geneli listede (`showEvent`) her işin etkinliği de yazılır. */
export function DeliveryJobList({ jobs, showEvent = false }: { jobs: DeliveryJobRow[]; showEvent?: boolean }) {
  return (
    <div className="mt-5 max-h-[400px] overflow-auto">
      <ul className="divide-y divide-rule">{jobs.map(j => {
        const p = j.project as { name: string; team_name: string } | null;
        const ev = j.event as { title: string } | null | undefined;
        return <li key={j.id} className="py-3 text-[0.875rem]">
          <p className="font-medium">{p?.name ?? "Eser"} · {p?.team_name}</p>
          <p className="text-ink-3">{showEvent && <>{ev?.title} · </>}{j.kind === "submit" ? "Teslim" : "Mühür"} · {JOB_STATE[j.state]} · {j.attempts}/5 deneme</p>
          {j.error && <p className="mt-1 break-all text-danger">{j.error}</p>}
          {j.state === "failed" && <RetryJobButton id={j.id} />}
          {j.state === "queued" && <p className="text-ink-3">Sonraki deneme: {formatTime(j.next_attempt_at)}</p>}
        </li>;
      })}</ul>
    </div>
  );
}
