import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SignInButton } from "@/components/buttons";
import { ExhibitLabel } from "@/components/exhibit-label";
import { JoinForm } from "@/components/join-form";
import { getEventById, getOwnProject, getViewer, logoUrl } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/server";
import { askiBilgisi, SuspensionNotice } from "@/components/suspension-notice";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";

export const metadata = { title: "Ekibe katıl" };

export default async function InvitePage({ params }: PageProps<"/davet/[code]">) {
  await connection();
  const { code } = await params;
  const db = createAdminClient();
  // Davet kodu tekildir; etkinlik kodun projesinden okunur. Geçersiz kod 404.
  const [viewer, { data: project, error }] = await Promise.all([
    getViewer(),
    db
      .from("projects")
      .select("event_id, exhibit_no, name, team_name, summary, logo_path, repo_full_name, repo_url, frozen_sha, freeze_error, archive_sha256, accepted_sha")
      .eq("invite_code", code)
      .maybeSingle(),
  ]);
  if (error) throw new Error("Davet okunamadı. Lütfen biraz sonra tekrar dene.");
  if (!project) notFound();
  const event = await getEventById(project.event_id);
  if (!event) notFound();
  const own = viewer ? await getOwnProject(viewer.id, event.id) : null;

  let body: React.ReactNode;
  if (event.locked) body = <p className="text-ink-2">Teslim süresi doldu; ekipler artık değiştirilemez.</p>;
  else if (!viewer) body = <SignInButton next={`/davet/${code}`} label="GitHub ile giriş yap ve katıl" />;
  else if (own) body = <p className="text-ink-2">Zaten bir projenin ekibindesin. Bu ekibe katılmak için önce oradan ayrılmalısın.</p>;
  else body = <JoinForm eventId={event.id} code={code} suspended={event.suspended} />;
  const showReason = event.suspended && can(await getEventAccess(viewer, event), "incele");

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-[1240px] flex-1 items-start gap-14 px-5 pt-10 pb-28 sm:px-8 md:grid-cols-[260px_1fr] md:gap-20 md:pt-16">
        <ExhibitLabel exhibit={project} logo={logoUrl(project.logo_path)} locked={event.locked} />
        <div className="max-w-[56ch]">
          <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-balance">
            {project.team_name} seni ekibe çağırıyor.
          </h1>
          <p className="mt-3 mb-10 text-[1.0625rem] leading-relaxed text-ink-2">
            Katıldığında eserin bilgilerini mühür vurulana kadar sen de düzenleyebilirsin. Bir kişi yalnızca bir ekipte olabilir.
          </p>
          <SuspensionNotice event={askiBilgisi(event, showReason)} showReason={showReason} className="mb-8" />
          {body}
        </div>
      </main>
    </>
  );
}
