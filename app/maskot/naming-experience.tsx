"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { SignInButton } from "@/components/buttons";
import type { NamingProposal, NamingSnapshot } from "@/lib/mascot-naming";
import {
  editMascotName, setMascotPhase, setMascotProposalVisibility, suggestMascotName, voteMascotName,
  type NamingActionState,
} from "./actions";

function useActionRefresh(state: NamingActionState, reload: () => void) {
  useEffect(() => { if (state?.ok) reload(); }, [state, reload]);
}

function SuggestionForm({ reload }: { reload: () => void }) {
  const [state, action, pending] = useActionState(suggestMascotName, undefined);
  useActionRefresh(state, reload);
  return <form action={action} className="naming-form" aria-busy={pending}>
    <label htmlFor="mascot-name">İsim önerin</label>
    <div className="naming-input-row">
      <input id="mascot-name" name="name" type="text" minLength={2} maxLength={24}
        autoComplete="off" required disabled={pending} />
      <button type="submit" disabled={pending}>{pending ? "Gönderiliyor…" : "Öner"}</button>
    </div>
    {state?.error && <p role="alert" className="naming-error">{state.error}</p>}
  </form>;
}

function EditForm({ name, onSaved, onCancel }: { name: string; onSaved: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(editMascotName, undefined);
  // Kontrollü alan: React formu eylemden sonra sıfırlar, hata alınca yazılan isim kaybolmasın.
  const [value, setValue] = useState(name);
  useActionRefresh(state, onSaved);
  return <form action={action} className="naming-form" aria-busy={pending}>
    <label htmlFor="mascot-name-edit">İsmi düzenle</label>
    <div className="naming-input-row">
      <input id="mascot-name-edit" name="name" type="text" minLength={2} maxLength={24}
        autoComplete="off" required readOnly={pending} autoFocus
        value={value} onChange={event => setValue(event.target.value)} />
      <button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</button>
    </div>
    <button type="button" className="naming-text-button" onClick={onCancel} disabled={pending}>Vazgeç</button>
    {state?.error && <p role="alert" className="naming-error">{state.error}</p>}
  </form>;
}

function OwnProposal({ name, reload }: { name: string; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const onSaved = useCallback(async () => {
    await reload();
    setEditing(false);
  }, [reload]);
  if (editing) return <EditForm name={name} onSaved={onSaved} onCancel={() => setEditing(false)} />;
  return <>
    <p className="naming-status">Önerin: <strong className="naming-own-name">{name}</strong></p>
    <button type="button" className="naming-text-button" onClick={() => setEditing(true)}>İsmi düzenle</button>
  </>;
}

function VoteForm({ proposalId, name, reload }: { proposalId: string; name: string; reload: () => void }) {
  const [state, action, pending] = useActionState(voteMascotName, undefined);
  useActionRefresh(state, reload);
  return <form action={action} className="naming-vote-form" aria-busy={pending}>
    <input type="hidden" name="proposalId" value={proposalId} />
    <button type="submit" disabled={pending} aria-label={`${name} için oy ver`}>
      {pending ? "Gönderiliyor…" : "Oy ver"}
    </button>
    {state?.error && <p role="alert" className="naming-error">{state.error}</p>}
  </form>;
}

function AdminForm({ action, fields, label, reload, subtle = false, confirmMessage }: {
  action: (_previous: NamingActionState, form: FormData) => Promise<NamingActionState>;
  fields: Record<string, string>;
  label: string;
  reload: () => void;
  subtle?: boolean;
  confirmMessage?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  useActionRefresh(state, reload);
  return <form action={dispatch} className={subtle ? "naming-admin-subtle" : "naming-admin-form"}
    aria-busy={pending}
    onSubmit={event => { if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault(); }}>
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : label}</button>
    {state?.error && <p role="alert" className="naming-error">{state.error}</p>}
  </form>;
}

function ProposalCard({ item, snapshot, reload }: {
  item: NamingProposal;
  snapshot: NamingSnapshot;
  reload: () => void;
}) {
  const voting = snapshot.phase === "oylama";
  const canVote = voting && snapshot.isSignedIn && !snapshot.votedProposalId && !item.own && item.visible;
  const selected = snapshot.votedProposalId === item.id;
  return <li className={`naming-proposal ${!item.visible ? "is-hidden" : ""} ${selected ? "is-selected" : ""}`}>
    <div className="naming-proposal-top">
      <div>
        <h3>{item.name}</h3>
        {!item.visible && <p>Yayından kaldırıldı</p>}
        {voting && item.own && <p>Kendi önerin</p>}
        {selected && <p>Oyun kaydedildi</p>}
      </div>
      {snapshot.phase !== "oneriler" && item.visible && <strong className="naming-vote-count" aria-label={`${item.votes} oy`}>{item.votes}</strong>}
    </div>
    {canVote && <VoteForm proposalId={item.id} name={item.name} reload={reload} />}
    {snapshot.canManage && snapshot.phase === "oneriler" && <AdminForm
      action={setMascotProposalVisibility}
      fields={{ proposalId: item.id, visible: String(!item.visible) }}
      label={item.visible ? "Yayından kaldır" : "Yeniden göster"}
      reload={reload} subtle />}
  </li>;
}

export function NamingExperience({ initial }: { initial: NamingSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [offline, setOffline] = useState(false);
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/maskot/durum", { cache: "no-store" });
      if (!response.ok) throw new Error("Durum alınamadı");
      setSnapshot(await response.json() as NamingSnapshot);
      setOffline(false);
    } catch { setOffline(true); }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) void reload(); }, 5000);
    const onVisible = () => { if (!document.hidden) void reload(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reload);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", reload); };
  }, [reload]);

  const visible = snapshot.proposals.filter(item => item.visible);
  const list = [...snapshot.proposals].sort((a, b) => snapshot.phase === "oneriler"
    ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    : b.votes - a.votes || a.name.localeCompare(b.name, "tr"));
  const maxVotes = Math.max(0, ...visible.map(item => item.votes));
  const winners = snapshot.phase === "sonuc" && maxVotes > 0 ? visible.filter(item => item.votes === maxVotes) : [];

  return <div className="naming-shell">
    <aside className="naming-identity">
      <h1>{snapshot.phase === "oneriler" ? "İsim öner" : snapshot.phase === "oylama" ? "Oy ver" : "Sonuç"}</h1>
      <Mascot mood={snapshot.phase === "sonuc" ? "mutlu" : "merakli"} title="Kulüp maskotu" className="naming-mascot" />
    </aside>

    <div className="naming-content">
      {offline && <p className="naming-offline" role="status">Bağlantı kesildi. Liste yeniden bağlanınca güncellenecek.</p>}

      <section className="naming-action" aria-label="Katılım">
        {snapshot.phase === "oneriler" ? <>
          {snapshot.ownProposal ? snapshot.ownProposal.visible
            ? <OwnProposal name={snapshot.ownProposal.name} reload={reload} />
            : <p className="naming-status">Önerin kaydedildi</p>
            : snapshot.canSuggest ? <SuggestionForm reload={reload} />
              : snapshot.isSignedIn ? <p className="naming-status">Yalnızca kayıtlı yarışmacılar isim önerebilir</p>
                : <><p className="naming-status">İsim önermek için yarışmacı olmalısın</p><SignInButton next="/maskot" label="GitHub ile giriş yap" /></>}
        </> : snapshot.phase === "oylama" ? <>
          {snapshot.votedProposalId ? <p className="naming-status">Oyun kaydedildi</p>
            : snapshot.isSignedIn ? <p className="naming-status">Kendi önerin dışında bir isim seç</p>
              : <SignInButton next="/maskot" label="GitHub ile oy ver" />}
        </> : <>
          {winners.length > 0 ? <p className="naming-winner">{winners.map(item => item.name).join(", ")}</p>
            : <p className="naming-status">Oy kullanılmadı</p>}
        </>}
      </section>

      <section className="naming-list-area" aria-labelledby="naming-list-title">
        <h2 id="naming-list-title">İsimler</h2>
        {list.length ? <ul className="naming-list">{list.map(item => <ProposalCard key={item.id} item={item} snapshot={snapshot} reload={reload} />)}</ul>
          : <p className="naming-empty">Henüz öneri yok</p>}
      </section>

      {snapshot.canManage && snapshot.phase !== "sonuc" && <section className="naming-admin-panel" aria-label="Organizatör işlemleri">
        <AdminForm action={setMascotPhase} fields={{ phase: snapshot.phase === "oneriler" ? "oylama" : "sonuc" }}
          label={snapshot.phase === "oneriler" ? "Oylamayı aç" : "Sonucu açıkla"} reload={reload}
          confirmMessage={snapshot.phase === "oneriler"
            ? "Öneri aşaması kapanacak ve isimler artık değiştirilemeyecek. Halk oylamasını açmak istiyor musun?"
            : "Oylama kapanacak ve yeni oy kabul edilmeyecek. Sonucu açıklamak istiyor musun?"} />
      </section>}
    </div>
  </div>;
}
