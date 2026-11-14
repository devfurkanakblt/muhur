import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { eventUrl } from "@/lib/event-routes";
import { notifyEvent, tg } from "@/lib/notify";

/** Bir etkinlik/pencere için tek bildirim; başarısız gönderim daha sonra yeniden denenir. */
export async function sendReminders(ev: { id: string; slug: string; title: string; deadline: string; locked_at: string | null; telegram: boolean }) {
  if (!ev.telegram || !env.telegramBotToken || !env.telegramChatId || ev.locked_at) return;
  const left = +new Date(ev.deadline) - Date.now();
  if (left <= 0 || left > 60 * 60_000) return;
  const windowMinutes = left <= 15 * 60_000 ? 15 : 60;
  const db = createAdminClient();
  const { data: existing } = await db.from("event_reminders").select("sent_at, lease_until")
    .eq("event_id", ev.id).eq("window_minutes", windowMinutes).maybeSingle();
  if (existing?.sent_at || (existing && +new Date(existing.lease_until) > Date.now())) return;
  const lease = new Date(Date.now() + 120_000).toISOString();
  const claimed = existing
    ? await db.from("event_reminders").update({ lease_until: lease }).eq("event_id", ev.id)
      .eq("window_minutes", windowMinutes).is("sent_at", null).lt("lease_until", new Date().toISOString()).select("event_id")
    : await db.from("event_reminders").insert({ event_id: ev.id, window_minutes: windowMinutes, lease_until: lease }).select("event_id");
  if (claimed.error || !claimed.data?.length) return;
  const { data: projects } = await db.from("projects").select("team_name, accepted_sha, repo_head_sha, health_issues")
    .eq("event_id", ev.id);
  const needsAttention = (projects ?? []).filter(p => !p.accepted_sha || p.health_issues.length || (p.repo_head_sha && p.repo_head_sha !== p.accepted_sha));
  const teams = needsAttention.slice(0, 15).map(p => p.team_name).join(", ");
  const sent = await notifyEvent(ev, [
    `⏳ ${tg.b(`${ev.title} · son ${Math.ceil(left / 60_000)} dakika`)}`,
    "Son push'tan sonra panelde teslim sürümünü güncelle. Arşivin süre dolmadan kabul edilmiş olmalı.",
    ...(teams ? [`Kontrol bekleyen ekipler: ${tg.text(teams)}${needsAttention.length > 15 ? ` ve ${needsAttention.length - 15} ekip daha` : ""}`] : []),
    tg.link(eventUrl(env.siteUrl, ev.slug, "panel"), "Teslimini kontrol et"),
  ], "son-dakika");
  if (sent) await db.from("event_reminders").update({ sent_at: new Date().toISOString() })
    .eq("event_id", ev.id).eq("window_minutes", windowMinutes).eq("lease_until", lease);
}
