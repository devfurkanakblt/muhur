import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getEvent, getOwnProject, getViewer } from "@/lib/data";
import { getEventAccess } from "@/lib/access";
import { can } from "@/lib/authz";
import { createHash } from "node:crypto";

export async function getLiveStatus() {
  const [event, viewer] = await Promise.all([getEvent(), getViewer()]);
  const db = createAdminClient();
  const [project, { data: updates, error }, { count: awardCount }, { count: voteCount }] = await Promise.all([
    viewer ? getOwnProject(viewer.id, event.id) : null,
    db.from("projects").select("id, updated_at, archive_sha256, freeze_error, accepted_at, health_checked_at").eq("event_id", event.id).order("id"),
    db.from("awards").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    db.from("votes").select("user_id", { count: "exact", head: true }).eq("event_id", event.id),
  ]);
  if (error) throw new Error("Güncel durum okunamadı.");
  const { data: jobs } = project ? await db.from("delivery_jobs").select("id, state, attempts, error").eq("project_id", project.id).order("created_at", { ascending: false }).limit(10) : { data: null };
  const access = await getEventAccess(viewer, event);
  // Zamanlayıcı kayıtları platform genelidir; sürüm özetine yalnızca head admin için girer.
  const adminState = can(access, "incele") ? await Promise.all([
    access?.headAdmin ? db.from("worker_runs").select("id, finished_at, error, processed").order("started_at", { ascending: false }).limit(5) : { data: null },
    db.from("delivery_jobs").select("id, state, attempts, error").eq("event_id", event.id).order("created_at", { ascending: false }).limit(30),
  ]) : null;
  const version = createHash("sha256").update(JSON.stringify({
    event: [event.id, event.startsAt, event.deadline, event.locked, event.lockedAt, event.voting, event.announcementAt, event.activity?.at],
    updates, awardCount, voteCount, project: project ? [project.id, project.accepted_sha, project.delivery_error, project.members] : null, jobs,
    admin: adminState?.map(s => s.data),
  })).digest("hex");
  return { version, now: event.now, deadline: event.deadline, locked: event.locked };
}
