import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ArrowLeftIcon, DownloadSimpleIcon, LockSimpleIcon, ReceiptIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { SiteHeader } from "@/components/site-header";
import { SignInButton } from "@/components/buttons";
import { RepoPicker } from "@/components/repo-picker";
import { ProjectForm } from "@/components/project-form";
import { CopyField } from "@/components/copy-field";
import { ExhibitLabel } from "@/components/exhibit-label";
import { Mascot } from "@/components/mascot/mascot";
import { SealRecord } from "@/components/seal-record";
import { DeliveryPanel } from "@/components/delivery-panel";
import { TransferOwnerForm, WithdrawProjectForm } from "@/components/team-actions";
import { LiveState } from "@/components/live-state";
import { getLiveStatus } from "@/lib/status";
import { ActionForm, ActionButton } from "@/components/action-form";
import { exhibitPath, getEvent, getExhibits, getOwnProject, getViewer, getTimeline, getProjectJobs, logoUrl, projectHasMystery, type EventState, type OwnProject, type Viewer } from "@/lib/data";
import { HEALTH_TEXT } from "@/lib/health";
import { getRepo, GithubError, listPublicRepos, parseRepoInput } from "@/lib/github";
import { exhibitNo, formatDateTime, relativeTR } from "@/lib/format";
import { env } from "@/lib/env";
import { leaveProject, recheckHealth, removeMember, renewInvite, signOut } from "@/app/actions";

export const maxDuration = 300;

export const metadata = { title: "Projem" };

async function Shell({ viewer, children }: { viewer: Viewer | null; children: React.ReactNode }) {
  const status = await getLiveStatus();
  return (
    <>
      <SiteHeader viewer={viewer} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-10 pb-28 sm:px-8 md:pt-16">
        <LiveState version={status.version} fast />
        {children}
        {viewer && (
          <ActionForm action={signOut} className="mt-16 sm:hidden">
            <ActionButton pending="Çıkış yapılıyor…" className="press text-[0.9375rem] text-ink-3 hover:text-ink">Çıkış yap</ActionButton>
          </ActionForm>
        )}
      </main>
    </>
  );
}

function PageTitle({ children, note, level = 1 }: { children: React.ReactNode; note?: React.ReactNode; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="mb-12 max-w-[60ch]">
      <Heading className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-balance">{children}</Heading>
      {note && <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-2">{note}</p>}
    </div>
  );
}

export default async function PanelPage({ searchParams }: PageProps<"/panel">) {
  await connection();
  const params = await searchParams;
  const [viewer, event] = await Promise.all([getViewer(), getEvent()]);

  if (!viewer) {
    return (
      <Shell viewer={null}>
        <div className="flex flex-col items-start gap-8">
          <Mascot mood="normal" title="" className="w-40" />
          <PageTitle note="Projeni içe aktarmak için GitHub hesabını bağla. Yalnızca public repolarını görürüz.">
            Önce giriş yap.
          </PageTitle>
          {event.locked ? (
            <p className="text-ink-2">Teslim süresi doldu; yeni proje kabul edilmiyor.</p>
          ) : (
            <div>
              <SignInButton />
              <p className="mt-4 max-w-[52ch] text-[0.8125rem] text-ink-3">
                Giriş yaptığında GitHub kullanıcı adın ve profil bilgilerin{" "}
                <Link href="/gizlilik" className="underline underline-offset-2 hover:text-ink">
                  aydınlatma metnindeki
                </Link>{" "}
                amaçlarla işlenir.
              </p>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  const project = await getOwnProject(viewer.id, event.id);
  if (project) return <ProjectView viewer={viewer} project={project} event={event} justCreated={params.kayit === "tamam"} />;

  if (event.locked) {
    return (
      <Shell viewer={viewer}>
        <div className="flex flex-col items-start gap-8">
          <Mascot mood="uykulu" title="" className="w-44" />
          <PageTitle note={`Teslimler ${formatDateTime(event.sealTime)} itibarıyla mühürlendi. Yeni proje kabul edilmiyor.`}>
            Vitrin kapandı.
          </PageTitle>
        </div>
      </Shell>
    );
  }

  const deadlineNote = `Son teslim ${formatDateTime(event.deadline)}. Son push'tan sonra teslim sürümünü güncelle; arşivin süre dolmadan doğrulanmalı.`;
  const repoParam = typeof params.repo === "string" ? parseRepoInput(params.repo) : null;

  if (repoParam) {
    let repoError: string | null = null;
    let repoName = repoParam;
    try {
      const repo = await getRepo(repoParam);
      repoName = repo.full_name;
      if (repo.private) repoError = "Bu repo private. Hackathon kuralları gereği yalnızca public repolar kabul ediliyor.";
    } catch (e) {
      // Yalnızca 404 "bulunamadı" demektir; GitHub kesintisi reponun yokluğu gibi gösterilmez (A09).
      repoError = e instanceof GithubError && e.status === 404
        ? "Repo bulunamadı. Bağlantıyı ve reponun public olduğunu kontrol et."
        : "GitHub'a şu an ulaşılamadı; repo kontrol edilemedi. Biraz sonra tekrar dene.";
    }
    if (!repoError) {
      return (
        <Shell viewer={viewer}>
          <Link href="/panel" className="mb-8 inline-flex items-center gap-1.5 text-[0.9375rem] text-ink-2 hover:text-ink">
            <ArrowLeftIcon size={16} /> Başka repo seç
          </Link>
          <PageTitle note={<>Seçilen repo: <span className="font-mono text-[0.9375rem] text-ink">{repoName}</span></>}>
            Eserini tanıt.
          </PageTitle>
          <ProjectForm
            mode="create"
            repo={repoName}
            initial={{ name: repoName.split("/")[1].replace(/[-_]/g, " "), team: "", summary: "", logo: null }}
          />
        </Shell>
      );
    }
    return <Picker viewer={viewer} eventId={event.id} note={deadlineNote} error={repoError} />;
  }

  return <Picker viewer={viewer} eventId={event.id} note={deadlineNote} />;
}

async function Picker({ viewer, eventId, note, error }: { viewer: Viewer; eventId: string; note: string; error?: string }) {
  const token = (await cookies()).get("gh_token")?.value;
  // GitHub'a ulaşılamazsa liste boş sayılmaz: ekip hatayı görür, bağlantı yapıştırarak devam edebilir (A09).
  const [{ repos, listFailed }, exhibits] = await Promise.all([
    listPublicRepos(token, viewer.login).then(
      (repos) => ({ repos, listFailed: false }),
      (e) => {
        console.error("[github] repo listesi:", e instanceof Error ? e.message : e);
        return { repos: [], listFailed: true };
      },
    ),
    getExhibits(eventId),
  ]);
  const taken = new Set(exhibits.map((e) => e.repo_full_name.toLowerCase()));
  return (
    <Shell viewer={viewer}>
      <div className="grid gap-12 md:grid-cols-[1fr_minmax(0,640px)]">
        <PageTitle note={note}>Hangi repo vitrine çıkacak?</PageTitle>
        <RepoPicker
          error={error}
          listFailed={listFailed}
          repos={repos.map((r) => ({
            id: r.id,
            full_name: r.full_name,
            description: r.description,
            pushed: relativeTR(r.pushed_at),
            taken: taken.has(r.full_name.toLowerCase()),
          }))}
        />
      </div>
    </Shell>
  );
}

async function ProjectView({
  viewer,
  project,
  event,
  justCreated,
}: {
  viewer: Viewer;
  project: OwnProject;
  event: EventState;
  justCreated: boolean;
}) {
  const { locked, sealTime } = event;
  const href = exhibitPath(event.slug, project.exhibit_no);
  const badgeUrl = `${env.siteUrl}/api/rozet/${event.slug}/${project.exhibit_no}`;
  const badgeMd = `[![mühür](${badgeUrl})](${env.siteUrl}${href})`;
  const issues = project.health_issues ?? [];
  const isOwner = project.members.find((m) => m.user_id === viewer.id)?.role === "owner";
  const logo = logoUrl(project.logo_path);
  const inviteUrl = `${env.siteUrl}/davet/${project.invite_code}`;
  const [timeline, jobs, mystery] = await Promise.all([getTimeline(project.id), getProjectJobs(project.id), projectHasMystery(event.id, project.id)]);
  const mysteryMd = `[![gizem avcısı](${badgeUrl}/gizem)](${env.siteUrl}${href})`;

  return (
    <Shell viewer={viewer}>
      <h1 className="mb-3 text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold tracking-[-0.02em]">Projem<span className="text-indigo">.</span></h1>
      <p className="mb-6 break-words text-ink-2">{project.name} · {project.team_name}</p>
      <nav aria-label="Proje bölümleri" className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem]">
        <a href="#teslim" className="inline-flex min-h-11 items-center underline">Kod teslimi</a>
        <a href="#proje-bilgileri" className="inline-flex min-h-11 items-center underline">Proje bilgileri</a>
        <a href="#ekip" className="inline-flex min-h-11 items-center underline">Ekip ve davet</a>
      </nav>
      <DeliveryPanel project={project} event={event} timeline={timeline} jobs={jobs} />
      {!project.logo_path && !locked && <p role="alert" className="mb-8 text-danger">Logo yüklenememiş veya henüz eklenmemiş. Aşağıdaki formdan tekrar yükle.</p>}
      {justCreated && !locked && (
        <div className="mb-14 flex items-center gap-5 border-y border-rule py-5">
          <Mascot mood="mutlu" title="" className="w-20 shrink-0" />
          <p className="text-[1.0625rem]">
            Eserin vitrinde{" "}
            <span className="mx-0.5 inline-block -rotate-2 rounded-[2px] bg-blush px-2 py-0.5 font-mono text-[0.875rem] text-[#0b0d1e] tnum">
              {exhibitNo(project.exhibit_no)}
            </span>
            . Mühür vurulana
            kadar buradan düzenleyebilir, ekibini davet edebilirsin.
          </p>
        </div>
      )}

      {!locked && issues.length > 0 && (
        <div role="alert" className="mb-14 border-y border-danger/40 py-5">
          <div className="flex items-start gap-3">
            <WarningIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-danger" />
            <div className="grid gap-3">
              {issues.map((i) => (
                <p key={i} className="max-w-[70ch]">
                  <span className="font-medium">{HEALTH_TEXT[i]?.title ?? i}</span>{" "}
                  <span className="text-ink-2">{HEALTH_TEXT[i]?.fix}</span>
                </p>
              ))}
              <ActionForm action={recheckHealth}>
                <ActionButton pending="Kontrol ediliyor…" className="press text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">Düzelttim, yeniden kontrol et</ActionButton>
              </ActionForm>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-14 lg:grid-cols-[260px_1fr] lg:gap-20">
        <aside>
          <p className="mb-4 text-[0.875rem] text-ink-3">Vitrinde böyle görünüyor</p>
          <ExhibitLabel exhibit={project} logo={logo} locked={locked} href={href} />
        </aside>

        <div id="proje-bilgileri" className="min-w-0">
          {locked ? (
            <>
              <div className="mb-10 flex items-end gap-6">
                <Mascot mood="uykulu" title="" className="w-28 shrink-0" />
                <PageTitle level={2} note="Bu kayıt artık değiştirilemez. Jüri yalnızca aşağıdaki commit'i değerlendirir; sonradan yapılan push'lar sayılmaz.">
                  <span className="inline-flex items-center gap-3">
                    <LockSimpleIcon size={28} weight="bold" className="text-indigo" /> {project.archive_sha256 ? "Mühürlendi" : "Teslim kapandı"}
                  </span>
                </PageTitle>
              </div>
              <SealRecord project={project} sealTime={sealTime} />
              {project.archive_sha256 && (
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-[0.9375rem]">
                  <Link href={`${href}/makbuz`} className="inline-flex items-center gap-2 text-ink hover:underline">
                    <ReceiptIcon size={18} /> Mühür makbuzu
                  </Link>
                  <a href={`/api/arsiv/${project.id}`} className="inline-flex items-center gap-2 text-ink hover:underline">
                    <DownloadSimpleIcon size={18} /> Mühürlü arşivi indir
                  </a>
                </div>
              )}
            </>
          ) : (
            <>
              <PageTitle level={2} note="Bilgileri burada düzenle. Yeni push'larını teslim etmek için yukarıdaki teslim sürümünü güncelle düğmesini kullan.">
                {project.name}
              </PageTitle>
              <ProjectForm
                mode="edit"
                initial={{ name: project.name, team: project.team_name, summary: project.summary, logo, demo: project.demo_url }}
              />
            </>
          )}

          <section className="mt-20 border-t border-ink pt-5">
            <h2 id="ekip" className="text-[1.125rem] font-semibold">Ekip ve davet</h2>
            <ul className="mt-5 divide-y divide-rule">
              {project.members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-4 py-3">
                  <a href={`https://github.com/${m.github_login}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:underline">
                    {m.avatar_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt="" className="h-8 w-8 rounded-full border border-rule" />
                    )}
                    <span>{m.github_login}</span>
                    {m.role === "owner" && <span className="text-[0.8125rem] text-ink-3">kurucu</span>}
                  </a>
                  {!locked && isOwner && m.role === "member" && (
                    <ActionForm action={removeMember}>
                      <input type="hidden" name="userId" value={m.user_id} />
                      <ActionButton pending="Çıkarılıyor…" className="press text-[0.875rem] text-ink-3 hover:text-danger">Çıkar</ActionButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>

            {!locked && isOwner && (
              <div className="mt-8 max-w-[560px]">
                <p className="mb-3 text-[0.9375rem] text-ink-2">Ekip arkadaşların bu bağlantıyla katılır.</p>
                <CopyField value={inviteUrl} label="Davet bağlantısı" />
                <ActionForm action={renewInvite} className="mt-3">
                  <ActionButton pending="Yenileniyor…" className="press text-[0.875rem] text-ink-3 hover:text-ink">Bağlantıyı yenile</ActionButton>
                </ActionForm>
              </div>
            )}
            {!locked && isOwner && project.members.length > 1 && <TransferOwnerForm members={project.members} />}

            {!locked && (
              <div className="mt-14">
                {isOwner ? (
                  <WithdrawProjectForm name={project.name} />
                ) : (
                  <ActionForm action={leaveProject}>
                    <ActionButton pending="Ayrılınıyor…" className="press text-[0.875rem] text-ink-3 hover:text-danger">Ekipten ayrıl</ActionButton>
                  </ActionForm>
                )}
              </div>
            )}
          </section>
          <section className="mt-20 border-t border-ink pt-5">
            <h2 className="text-[1.125rem] font-semibold">Rozet</h2>
            <p className="mt-2 mb-4 max-w-[60ch] text-[0.9375rem] text-ink-2">
              README dosyana ekle; mühür vurulunca rozet commit kodunu kendiliğinden gösterir.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/rozet/${event.slug}/${project.exhibit_no}`} alt="mühür rozeti" className="mb-4 h-5" />
            <div className="max-w-[640px]">
              <CopyField value={badgeMd} label="Rozet için Markdown" />
            </div>
            {mystery && (
              <div className="mt-10">
                <h3 className="font-semibold">Gizem avcısı</h3>
                <p className="mt-2 mb-4 max-w-[60ch] text-[0.9375rem] text-ink-2">
                  Ekibinden biri açılış videosundaki gizemi çözdü. İstersen bu rozeti de mühür rozetinin yanına ekle.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/rozet/${event.slug}/${project.exhibit_no}/gizem`} alt="gizem avcısı rozeti" className="mb-4 h-5" />
                <div className="max-w-[640px]">
                  <CopyField value={mysteryMd} label="Gizem rozeti için Markdown" />
                </div>
              </div>
            )}
          </section>


        </div>
      </div>
    </Shell>
  );
}
