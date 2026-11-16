"use client";

import { useActionState, useEffect, useState } from "react";
import { updateEventPresentation, type FormState } from "@/app/actions";
import { updateCommunityBranding, type CommunityActionState } from "@/app/topluluk/actions";
import { useProtectedForm } from "@/components/protected-form";
import { SubmitButton } from "@/components/buttons";
import { accentTokens, checkAccent, DEFAULT_ACCENT, THEME } from "@/lib/branding";
import { FEATURE_KEYS, FEATURE_LABELS, type EventFeatures } from "@/lib/event-features";
import { LOGO } from "@/lib/logo-spec";

const input = "h-12 w-full rounded-[2px] border border-rule-strong bg-plinth px-3 text-[0.9375rem] placeholder:text-ink-3 focus:border-ink focus:outline-none";
const label = "text-[0.9375rem] font-medium";

function Status({ state, ok }: { state: { error?: string; ok?: boolean } | undefined; ok: string }) {
  if (state?.error) return <p role="alert" className="text-[0.9375rem] text-danger">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-[0.9375rem] text-ink-2">{ok}</p>;
  return null;
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0]).join("").toLocaleUpperCase("tr") || "?";
}

type Theme = "light" | "dark";
const themeName: Record<Theme, string> = { light: "Açık tema", dark: "Koyu tema" };
const darkInk = THEME.dark.ink;

/** Önizleme: gerçek tema tokenlarıyla küçük bir etkinlik başlığı. Renk tek anlam taşıyıcısı değildir; metin etiketlidir. */
function Preview({ theme, name, logo, color, title }: { theme: Theme; name: string; logo: string | null; color: string; title: string }) {
  const t = accentTokens(color)[theme];
  const bg = theme === "light" ? THEME.light.wall : THEME.dark.wall;
  const ink = theme === "light" ? THEME.light.ink : darkInk;
  return (
    <figure className="grid gap-3 rounded-[2px] border border-rule p-4" style={{ background: bg, color: ink }}>
      <figcaption className="text-[0.8125rem]" style={{ color: ink, opacity: 0.8 }}>{themeName[theme]}</figcaption>
      <div className="flex items-center gap-3">
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt="" width={36} height={36} className="size-9 rounded-[2px] object-contain" />
          : <span aria-hidden className="grid size-9 place-items-center rounded-[2px] border text-[0.8125rem] font-semibold" style={{ borderColor: t.accent }}>{initialsOf(name)}</span>}
        <span className="min-w-0">
          <span className="block truncate font-semibold">{name || "Topluluk adı"}</span>
          <span className="block truncate text-[0.875rem]" style={{ color: t.accent }}>{title}</span>
        </span>
      </div>
      <span className="inline-flex w-fit items-center rounded-[2px] px-3 py-1.5 text-[0.875rem] font-medium" style={{ background: t.fill, color: t.onFill }}>Örnek düğme</span>
    </figure>
  );
}

/** Topluluk markası: yalnız sahip. Kayıt sunucuda yeniden doğrulanır; form değişiklikleri kayıtlı olmadan kaybolmaz. */
export function CommunityBrandingForm({ community }: { community: { id: string; name: string; university: string | null; city: string | null; link: string | null; logoUrl: string | null } }) {
  const [state, action, pending] = useActionState<CommunityActionState, FormData>(updateCommunityBranding, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  const [name, setName] = useState(community.name);
  const [preview, setPreview] = useState<string | null>(community.logoUrl);
  const [fileError, setFileError] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <form {...protectedForm} className="grid max-w-[720px] gap-6" aria-busy={pending}>
      <input type="hidden" name="community" value={community.id} />
      <fieldset disabled={pending} className="grid min-w-0 gap-4">
        <legend className="sr-only">Topluluk bilgileri</legend>
        <label htmlFor="brand-name" className={label}>Topluluk adı</label>
        <input id="brand-name" name="name" required minLength={2} maxLength={80} defaultValue={community.name} onChange={(e) => setName(e.target.value)} className={input} />
        <label htmlFor="brand-university" className={label}>Üniversite / kurum (isteğe bağlı)</label>
        <input id="brand-university" name="university" maxLength={160} defaultValue={community.university ?? ""} className={input} />
        <label htmlFor="brand-city" className={label}>Şehir (isteğe bağlı)</label>
        <input id="brand-city" name="city" maxLength={80} defaultValue={community.city ?? ""} className={input} />
        <label htmlFor="brand-link" className={label}>Web / sosyal medya bağlantısı (isteğe bağlı)</label>
        <input id="brand-link" name="link" type="url" maxLength={2048} placeholder="https://" defaultValue={community.link ?? ""} className={input} />
        <label htmlFor="brand-logo" className={label}>Logo (isteğe bağlı)</label>
        <input id="brand-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="brand-logo-help"
          className="text-[0.9375rem] file:mr-3 file:min-h-11 file:rounded-[2px] file:border file:border-rule-strong file:bg-plinth file:px-3"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setFileError(null);
            if (!file) { setPreview(community.logoUrl); return; }
            if (!LOGO.types[file.type]) { setFileError("Logo PNG, JPG ya da WEBP olmalı."); e.target.value = ""; return; }
            if (file.size > LOGO.maxBytes) { setFileError("Logo en fazla 1 MB olabilir."); e.target.value = ""; return; }
            setRemove(false);
            setPreview(URL.createObjectURL(file));
          }} />
        <p id="brand-logo-help" className="text-[0.8125rem] text-ink-3">
          {LOGO.recommended}; en az {LOGO.minSide} px, en fazla 1 MB. Sunucuda yeniden kodlanır, dosyadaki gizli bilgiler (EXIF) silinir. SVG ve hareketli görsel kabul edilmez.
        </p>
        {fileError && <p role="alert" className="text-[0.9375rem] text-danger">{fileError}</p>}
        {community.logoUrl && (
          <label className="flex items-start gap-2 text-[0.9375rem]">
            <input type="checkbox" name="remove_logo" checked={remove} onChange={(e) => { setRemove(e.target.checked); if (e.target.checked) setPreview(null); else setPreview(community.logoUrl); }} className="mt-1" />
            Logoyu kaldır (baş harfler gösterilir). Mühürlü sergiler kilit anındaki logoyu korur.
          </label>
        )}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2" aria-label="Önizleme">
        <Preview theme="light" name={name} logo={remove ? null : preview} color={DEFAULT_ACCENT} title="Etkinlik adı" />
        <Preview theme="dark" name={name} logo={remove ? null : preview} color={DEFAULT_ACCENT} title="Etkinlik adı" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton variant="ink" busy={pending} pending="Kaydediliyor…">Markayı kaydet</SubmitButton>
        <button type="reset" disabled={pending} onClick={() => { setName(community.name); setPreview(community.logoUrl); setRemove(false); setFileError(null); }} className="min-h-11 underline">Değişiklikleri geri al</button>
        <Status state={state} ok="Marka kaydedildi. Mühürlü sergiler kilit anındaki görünümü korur." />
      </div>
    </form>
  );
}

/**
 * Etkinlik rengi ve özellikleri. Renk istemcide de iki temada sınanır (sunucu ve DB yeniden denetler);
 * okunamayan renk sessizce değiştirilmez, öneri gösterilir. Başladıktan sonra özellikler değiştirilemez.
 */
export function EventPresentationForm({ eventId, title, communityName, logoUrl, color, features, started, mascotAllowed }: {
  eventId: string; title: string; communityName: string; logoUrl: string | null; color: string | null; features: EventFeatures; started: boolean; mascotAllowed: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateEventPresentation, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  const [useDefault, setUseDefault] = useState(!color);
  const [value, setValue] = useState(color ?? DEFAULT_ACCENT);
  const check = checkAccent(value);
  const shown = useDefault ? DEFAULT_ACCENT : check.ok ? check.color : DEFAULT_ACCENT;
  const keys = FEATURE_KEYS.filter((k) => k !== "mascot_naming" || mascotAllowed);
  return (
    <form {...protectedForm} className="grid max-w-[720px] gap-6" aria-busy={pending}>
      <input type="hidden" name="event" value={eventId} />
      <fieldset disabled={pending} className="grid min-w-0 gap-3">
        <legend className={`${label} mb-2`}>Etkinlik rengi</legend>
        <label className="flex items-start gap-2 text-[0.9375rem]">
          <input type="checkbox" name="accent_default" checked={useDefault} onChange={(e) => setUseDefault(e.target.checked)} className="mt-1" />
          Platform rengini kullan
        </label>
        {!useDefault && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <label htmlFor="accent-picker" className="text-[0.875rem] text-ink-2">Renk seçici</label>
              <input id="accent-picker" type="color" value={check.ok ? check.color : DEFAULT_ACCENT} onChange={(e) => setValue(e.target.value)} className="h-12 w-16 rounded-[2px] border border-rule-strong bg-plinth" />
            </div>
            <div className="grid min-w-[10rem] flex-1 gap-2">
              <label htmlFor="accent-hex" className="text-[0.875rem] text-ink-2">HEX kodu</label>
              <input id="accent-hex" name="accent_color" value={value} onChange={(e) => setValue(e.target.value)} maxLength={7} spellCheck={false} autoComplete="off"
                aria-invalid={!check.ok} aria-describedby="accent-status" className={`${input} font-mono`} />
            </div>
          </div>
        )}
        {!useDefault && (
          <p id="accent-status" role={check.ok ? "status" : "alert"} className={`text-[0.9375rem] ${check.ok ? "text-ink-2" : "text-danger"}`}>
            {check.ok ? "Bu renk iki temada da okunabilir. Koyu temada otomatik olarak açılır." : check.error}
            {!check.ok && check.suggestion && (
              <> <button type="button" onClick={() => setValue(check.suggestion!)} className="underline underline-offset-4">Önerilen yakın tonu kullan ({check.suggestion})</button></>
            )}
          </p>
        )}
        <p className="text-[0.8125rem] text-ink-3">Renk yalnız bu etkinliğin sayfalarında görünür. Mühür ve kilit işaretleri platform rengini korur.</p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2" aria-label="Önizleme">
        <Preview theme="light" name={communityName} logo={logoUrl} color={shown} title={title} />
        <Preview theme="dark" name={communityName} logo={logoUrl} color={shown} title={title} />
      </div>
      <fieldset disabled={pending} className="grid min-w-0 gap-3">
        <legend className={`${label} mb-2`}>Özellikler</legend>
        {started && <p className="text-[0.9375rem] text-ink-2">Etkinlik başladı; özellikler artık değiştirilemez. Var olan oy, öneri ve kazanımlar korunur.</p>}
        {keys.map((key) => (
          <label key={key} className="flex items-start gap-2 text-[0.9375rem]">
            {/* Başlamış etkinlikte devre dışı kutu gönderilmez; mevcut değer gizli alanla korunur. */}
            {started && features[key] && <input type="hidden" name={`feature_${key}`} value="on" />}
            <input type="checkbox" name={`feature_${key}`} defaultChecked={features[key]} disabled={started} className="mt-1" />
            <span><span className="font-medium">{FEATURE_LABELS[key].title}</span> <span className="text-ink-3">· {FEATURE_LABELS[key].hint}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton variant="ink" busy={pending} pending="Kaydediliyor…" disabled={!useDefault && !check.ok}>Görünümü kaydet</SubmitButton>
        <button type="reset" disabled={pending} onClick={() => { setUseDefault(!color); setValue(color ?? DEFAULT_ACCENT); }} className="min-h-11 underline">Değişiklikleri geri al</button>
        <Status state={state} ok="Etkinlik görünümü kaydedildi." />
      </div>
    </form>
  );
}
