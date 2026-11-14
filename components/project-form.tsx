"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createProject, updateProject, type FormState } from "@/app/actions";
import { buttonStyles } from "@/components/button-styles";
import { LOGO, logoSizeError } from "@/lib/logo-spec";
import { formChanges, useProtectedForm } from "@/components/protected-form";

type Initial = { name: string; team: string; summary: string; logo: string | null; demo?: string | null };


const field =
  "w-full rounded-[2px] border border-rule-strong bg-plinth px-3 text-[1rem] placeholder:text-ink-3 focus:border-ink focus:outline-none aria-[invalid=true]:border-danger";

/** `suspended`: etkinlik platform tarafından askıda; DB yazmayı zaten reddeder, düğme pasif kalır. */
export function ProjectForm({ mode, repo, initial, suspended = false }: { mode: "create" | "edit"; repo?: string; initial: Initial; suspended?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "create" ? createProject : updateProject, undefined);
  const protectedForm = useProtectedForm(action, state, pending);
  const [summary, setSummary] = useState(initial.summary);
  const [preview, setPreview] = useState<string | null>(initial.logo);
  const [dragging, setDragging] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Dosya kutunun dışına bırakılırsa tarayıcı onu açıp sayfadan çıkmasın; yazılan form kaybolmasın.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  // Seçilen ya da bırakılan dosya aynı yoldan geçer: doğrulanır, gizli dosya alanına yazılır, önizlenir.
  const acceptFile = async (file: File | undefined) => {
    const input = fileRef.current;
    if (!file || !input) return;
    const reject = (message: string) => {
      setLogoError(message);
      input.value = "";
    };
    if (!LOGO.types[file.type]) return reject("Logo PNG, JPG ya da WEBP olmalı.");
    if (file.size > LOGO.maxBytes) return reject("Logo en fazla 1 MB olabilir.");
    let width = 0;
    let height = 0;
    try {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
    } catch {
      // Çözülemeyen görsel aşağıda "boyut okunamadı" hatası alır.
    }
    const sizeError = logoSizeError(width, height);
    if (sizeError) return reject(sizeError);
    if (input.files?.[0] !== file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    }
    setLogoError(null);
    if (input.form) formChanges.edit(input.form);
    setPreview((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  };

  return (
    <form
      {...protectedForm}
      onReset={() => {
        setSummary(initial.summary);
        setPreview(initial.logo);
        setLogoError(null);
      }}
      className="grid gap-x-12 gap-y-8 md:grid-cols-[200px_1fr]">
      {repo && <input type="hidden" name="repo" value={repo} />}

      <div>
        <span id="logo-label" className="mb-2 block text-[0.9375rem] font-medium">
          Logo · zorunlu
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          aria-labelledby="logo-label"
          aria-describedby="logo-help"
          data-dragging={dragging || undefined}
          className="press group relative grid aspect-square w-full max-w-[200px] place-items-center border border-dashed border-rule-strong bg-plinth transition-[border-color,background-color,transform] duration-150 hover:border-ink data-[dragging]:scale-[0.98] data-[dragging]:border-solid data-[dragging]:border-indigo data-[dragging]:bg-[var(--indigo-wash)]"
        >
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="pointer-events-none h-[46%] w-[46%] object-contain transition-opacity duration-150 group-data-[dragging]:opacity-25"
            />
          )}
          {(!preview || dragging) && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-[0.875rem] text-ink-2 group-data-[dragging]:font-medium group-data-[dragging]:text-indigo">
              {dragging ? "Bırak" : "Logo seç ya da buraya sürükle"}
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          name="logo"
          accept={Object.keys(LOGO.types).join(",")}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => acceptFile(e.target.files?.[0])}
        />
        <p id="logo-help" className="mt-2 text-[0.8125rem] text-ink-3">
          PNG, JPG ya da WEBP · en fazla 1&nbsp;MB
          <br />({LOGO.recommended})
        </p>
        {logoError && (
          <p role="alert" className="mt-1 text-[0.8125rem] text-danger">
            {logoError}
          </p>
        )}
      </div>

      <div className="grid max-w-[640px] gap-6">
        <div className="grid gap-2">
          <label htmlFor="name" className="text-[0.9375rem] font-medium">
            Proje adı
          </label>
          <input id="name" name="name" required minLength={2} maxLength={60} defaultValue={initial.name} className={`${field} h-12`} />
        </div>
        <div className="grid gap-2">
          <label htmlFor="team" className="text-[0.9375rem] font-medium">
            Ekip adı
          </label>
          <input id="team" name="team" required minLength={2} maxLength={60} defaultValue={initial.team} className={`${field} h-12`} />
        </div>
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="summary" className="text-[0.9375rem] font-medium">
              Kısa özet
            </label>
            <span className={`text-[0.8125rem] tnum ${summary.length > 280 ? "text-danger" : "text-ink-3"}`}>
              {summary.length}/280
            </span>
          </div>
          <textarea
            id="summary"
            name="summary"
            required
            minLength={10}
            maxLength={280}
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={`${field} resize-none py-3 leading-relaxed`}
            aria-describedby="summary-help"
          />
          <p id="summary-help" className="text-[0.8125rem] text-ink-3">
            Projen ne yapıyor? Jüri ve ziyaretçiler bunu vitrinde okuyacak.
          </p>
        </div>

        <details open={!!initial.demo}>
          <summary className="cursor-pointer text-[0.9375rem] text-ink-2">Demo bağlantısı ekle · isteğe bağlı</summary>
          <div className="mt-3 grid gap-2">
            <label htmlFor="demo" className="text-[0.9375rem] font-medium">Çalışan uygulama veya kısa video</label>
            <input id="demo" name="demo" type="url" maxLength={500} pattern="https://.*" defaultValue={initial.demo ?? ""}
              placeholder="https://" className={`${field} h-12`} aria-describedby="demo-help" />
            <p id="demo-help" className="text-[0.8125rem] text-ink-3">Herkese açık HTTPS bağlantısı. Demo sonradan değişebilir; jüri için esas kayıt mühürlü koddur.</p>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button type="submit" disabled={pending || suspended} aria-busy={pending} className={buttonStyles.primary}>
            {pending
              ? mode === "create"
                ? "Yerleştiriliyor…"
                : "Kaydediliyor…"
              : mode === "create"
                ? "Projeyi kaydet ve vitrine yerleştir"
                : "Değişiklikleri kaydet"}
          </button>
          <button type="reset" disabled={pending} className={buttonStyles.quiet}>Değişiklikleri geri al</button>
          <p role="status" className="text-[0.9375rem]">
            {state?.error && <span className="text-danger">{state.error}</span>}
            {state?.ok && !pending && <span className="text-ink-2">Kaydedildi.</span>}
          </p>
        </div>
      </div>
    </form>
  );
}
