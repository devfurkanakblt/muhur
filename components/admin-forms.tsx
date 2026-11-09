"use client";

import { useActionState, useState } from "react";
import { addAward, anonymizeUser, createEvent, retryDeliveryJob, setActivity, setAnnouncement, setSchedule, suspendEvent, unsuspendEvent, type FormState } from "@/app/actions";
import type { Activity } from "@/lib/data";
import { SubmitButton } from "@/components/buttons";
import { buttonStyles } from "@/components/button-styles";
import { useProtectedForm } from "@/components/protected-form";

const input =
  "h-12 w-full rounded-[2px] border border-rule-strong bg-plinth px-3 text-[0.9375rem] placeholder:text-ink-3 focus:border-ink focus:outline-none";
const label = "text-[0.9375rem] font-medium";

/** Eylemin etkinliği; sunucu yetkiyi bu etkinlik için yeniden denetler. */
function EventField({ id }: { id: string }) {
  return <input type="hidden" name="event" value={id} />;
}

export function RetryJobButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(retryDeliveryJob, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="mt-2" data-live-safe>
    <input type="hidden" name="jobId" value={id} />
    <button disabled={pending} className="press underline underline-offset-4">{pending ? "Sıraya alınıyor…" : "Tekrar dene"}</button>
    <Status state={state} ok="Yeniden deneme sıraya alındı." />
  </form>;
}

export function AwardForm({ eventId, projects }: { eventId: string; projects: { id: string; name: string; team_name: string }[] }) {
  const [state, action, pending] = useActionState(addAward, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="grid gap-3">
    <EventField id={eventId} />
    <label htmlFor="award-project" className={label}>Ödül alacak mühürlü eser</label>
    <select id="award-project" name="projectId" required className={input} defaultValue="">
      <option value="">Eser seç</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.team_name}</option>)}
    </select>
    <label htmlFor="award-title" className={label}>Ödül adı</label>
    <input id="award-title" name="title" minLength={2} maxLength={80} required className={input} placeholder="En iyi teknik çözüm" />
    <label htmlFor="award-reason" className={label}>Jürinin gerekçesi</label>
    <textarea id="award-reason" name="reason" minLength={10} maxLength={280} required rows={3} className={`${input} h-auto py-3`} />
    <div className="flex flex-wrap gap-3"><SubmitButton variant="ink" busy={pending} pending="Açıklanıyor…">Ödülü açıkla</SubmitButton><button type="reset" disabled={pending} className="min-h-11 underline">Değişiklikleri geri al</button><Status state={state} ok="Ödül açıklandı: vitrinde ve sahnede yayında, Telegram duyurusu gönderiliyor." /></div>
  </form>;
}

/** KVKK silme başvurusu: ad ve avatar kaldırılır, hesap kapanır; eser, teslim ve mühür kaydı korunur. */
export function AnonymizeForm() {
  const [state, action, pending] = useActionState(anonymizeUser, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="grid max-w-[560px] gap-3">
    <label htmlFor="anon-login" className={label}>GitHub kullanıcı adı</label>
    <input id="anon-login" name="login" required maxLength={40} autoComplete="off" spellCheck={false} placeholder="kullanici-adi" className={`${input} font-mono`} />
    <label htmlFor="anon-reason" className={label}>Başvuru ve gerekçe</label>
    <textarea id="anon-reason" name="reason" required minLength={5} maxLength={500} rows={2} placeholder="Ör. 5 Ekim tarihli e-posta ile silme başvurusu" className={`${input} h-auto py-3`} />
    <label className="flex items-start gap-2 text-[0.9375rem]"><input type="checkbox" required className="mt-1" /> Kişinin adı ve avatarı tüm sergilerden kaldırılacak, hesabı kapatılacak. Bu işlem geri alınamaz.</label>
    <div className="flex flex-wrap items-center gap-4">
      <SubmitButton variant="ghost" busy={pending} pending="Anonimleştiriliyor…">Anonimleştir</SubmitButton>
      <Status state={state} ok="Kişisel bilgiler kaldırıldı; işlem denetim kaydına yazıldı." />
    </div>
  </form>;
}

/**
 * Platform askısı (yalnızca head admin). Yıkıcı işlem düz onayla yapılır: gerekçe ve onay kutusu zorunlu.
 * Askıdayken aynı form askıyı kaldırır; gerekçe her iki yönde de denetim kaydına yazılır.
 */
export function SuspendForm({ eventId, suspended }: { eventId: string; suspended: boolean }) {
  const [state, action, pending] = useActionState(suspended ? unsuspendEvent : suspendEvent, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return <form {...protectedForm} className="grid max-w-[560px] gap-3">
    <EventField id={eventId} />
    <label htmlFor="aski-gerekce" className={label}>{suspended ? "Askıyı kaldırma gerekçesi" : "Askı gerekçesi"}</label>
    <textarea id="aski-gerekce" name="gerekce" required minLength={3} maxLength={500} rows={2}
      placeholder={suspended ? "Ör. İnceleme tamamlandı, ihlal bulunmadı." : "Ör. Kural ihlali bildirimi inceleniyor."} className={`${input} h-auto py-3`} />
    <label className="flex items-start gap-2 text-[0.9375rem]"><input type="checkbox" required className="mt-1" /> {suspended
      ? "Katılımcı yazmaları ve topluluk yönetimi yeniden açılacak."
      : "Katılımcı yazmaları ve topluluk yönetimi hemen duracak; uyarı herkese görünecek. Kuyruktaki teslimler ve süre dolunca kilit sürer."}</label>
    <div className="flex flex-wrap items-center gap-4">
      <SubmitButton variant="ghost" busy={pending} pending={suspended ? "Askı kaldırılıyor…" : "Askıya alınıyor…"}>{suspended ? "Askıyı kaldır" : "Askıya al"}</SubmitButton>
      <Status state={state} ok={suspended ? "Askı kaldırıldı; işlem denetim kaydına yazıldı." : "Etkinlik askıya alındı; işlem denetim kaydına yazıldı."} />
    </div>
  </form>;
}

function Status({ state, ok }: { state: FormState; ok: string }) {
  return (
    <p role="status" className="basis-full text-[0.9375rem]">
      {state?.error && <span className="text-danger">{state.error}</span>}
      {state?.ok && <span className="text-ink-2">{ok}</span>}
    </p>
  );
}

export function ScheduleForm({ eventId, starts, deadline }: { eventId: string; starts: string; deadline: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setSchedule, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return (
    <form {...protectedForm} className="grid gap-4">
      <EventField id={eventId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="starts" className={label}>
            Başlangıç
          </label>
          <input id="starts" name="starts" type="datetime-local" required defaultValue={starts} className={`${input} font-mono tnum`} />
        </div>
        <div className="grid gap-2">
          <label htmlFor="deadline" className={label}>
            Son teslim
          </label>
          <input id="deadline" name="deadline" type="datetime-local" required defaultValue={deadline} className={`${input} font-mono tnum`} />
        </div>
      </div>
      <p className="text-[0.8125rem] text-ink-3">Türkiye saati (UTC+3).</p>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton variant="ink" busy={pending} pending="Kaydediliyor…">
          Kaydet
        </SubmitButton>
        <button type="reset" disabled={pending} className="min-h-11 underline">Değişiklikleri geri al</button>
        <Status state={state} ok="Zamanlama güncellendi." />
      </div>
    </form>
  );
}

export function AnnouncementForm({ eventId, current }: { eventId: string; current: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setAnnouncement, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  const [text, setText] = useState(current ?? "");
  return (
    <form {...protectedForm} onReset={() => setText(current ?? "")} className="grid gap-3">
      <EventField id={eventId} />
      <div className="flex items-baseline justify-between">
        <label htmlFor="announcement" className={label}>
          Tüm sayfaların üstünde görünür
        </label>
        <span className={`text-[0.8125rem] tnum ${text.length > 160 ? "text-danger" : "text-ink-3"}`}>{text.length}/160</span>
      </div>
      <input
        id="announcement"
        name="announcement"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={160}
        placeholder="Yemek 19:00'da kantinde."
        className={input}
      />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton variant="ink" busy={pending} pending="Yayınlanıyor…">
          {text.trim() ? "Yayınla" : "Duyuruyu kaldır"}
        </SubmitButton>
        <button type="reset" disabled={pending} className="min-h-11 underline">Değişiklikleri geri al</button>
        <Status state={state} ok={text.trim() ? "Duyuru yayında." : "Duyuru kaldırıldı."} />
      </div>
    </form>
  );
}

/** Yemek ve mini oyun saatleri sabit değil; duyurulduğu an başlar, "Bitir" ile biter. */
export function ActivityForm({ eventId, current, since }: { eventId: string; current: Activity | null; since: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setActivity, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  const [endState, endAction, ending] = useActionState<FormState, FormData>(setActivity, undefined);
  const endForm = useProtectedForm(endAction, endState, ending);
  return (
    <div className="grid gap-6">
      {current && (
        <form {...endForm} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-indigo pl-4">
          <EventField id={eventId} />
          <input type="hidden" name="kind" value="bitir" />
          <p className="text-[0.9375rem]">
            <span className="text-ink-3">{current.kind === "yemek" ? "Yemek saati" : "Etkinlik"} · başlangıç {since}</span>
            <span className="block font-medium">{current.title}</span>
          </p>
          <SubmitButton variant="ghost" busy={ending} pending="Bitiriliyor…">Bitir</SubmitButton>
          <Status state={endState} ok="Bitti; maskot saatine döndü." />
        </form>
      )}
      <form {...protectedForm} className="grid gap-3">
        <EventField id={eventId} />
        <label htmlFor="activity-title" className={label}>
          {current ? "Yerine yenisini duyur" : "Ne başlıyor?"}
        </label>
        <input id="activity-title" name="title" required minLength={2} maxLength={60} list="activity-ideas" placeholder="Öğle yemeği, Vampir köylü…" className={input} />
        <datalist id="activity-ideas">
          <option value="Öğle yemeği" />
          <option value="Akşam yemeği" />
          <option value="Gece atıştırması" />
          <option value="Vampir köylü" />
        </datalist>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" name="kind" value="yemek" disabled={pending} className={buttonStyles.ink}>
            {pending ? "Duyuruluyor…" : "Yemek saati olarak duyur"}
          </button>
          <button type="submit" name="kind" value="oyun" disabled={pending} className={buttonStyles.ghost}>
            {pending ? "Duyuruluyor…" : "Etkinlik olarak duyur"}
          </button>
          <Status state={state} ok="Duyuruldu; maskot ve selam değişti." />
        </div>
      </form>
    </div>
  );
}

/** Yeni etkinlik verilen toplulukta açılır; yetkiyi sunucuda RPC denetler. */
/** Yeni etkinlik: onaylı topluluklardan biri seçilir; yetki sunucuda `admin_create_event` ile yeniden denetlenir. */
export function NewEventForm({ communities }: { communities: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createEvent, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  return (
    <form {...protectedForm} className="grid gap-4">
      {communities.length === 1 ? (
        <p className="text-[0.9375rem] text-ink-2">
          <input type="hidden" name="community" value={communities[0].id} />
          Topluluk: <span className="font-medium text-ink">{communities[0].name}</span>
        </p>
      ) : (
        <div className="grid gap-2">
          <label htmlFor="new-community" className={label}>
            Topluluk
          </label>
          <select id="new-community" name="community" required defaultValue={communities[0]?.id} className={input}>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="grid gap-2">
          <label htmlFor="title" className={label}>
            Etkinlik adı
          </label>
          <input id="title" name="title" required minLength={3} maxLength={80} placeholder="DEÜ CS&AI Hackathon · Bahar" className={input} />
        </div>
        <div className="grid gap-2">
          <label htmlFor="slug" className={label}>
            Adres kısaltması
          </label>
          <input id="slug" name="slug" required pattern="[a-z0-9-]{3,40}" placeholder="2027-bahar" className={`${input} font-mono`} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="new-starts" className={label}>
            Başlangıç
          </label>
          <input id="new-starts" name="starts" type="datetime-local" required className={`${input} font-mono tnum`} />
        </div>
        <div className="grid gap-2">
          <label htmlFor="new-deadline" className={label}>
            Son teslim
          </label>
          <input id="new-deadline" name="deadline" type="datetime-local" required className={`${input} font-mono tnum`} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton variant="ink" busy={pending} pending="Açılıyor…">
          Yeni etkinliği aç
        </SubmitButton>
        <button type="reset" disabled={pending} className="min-h-11 underline">Değişiklikleri geri al</button>
        <Status state={state} ok="Yeni etkinlik açıldı; bu etkinlik olduğu gibi sürüyor." />
      </div>
    </form>
  );
}
