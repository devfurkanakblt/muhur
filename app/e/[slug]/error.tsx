"use client";

import { NeutralError } from "@/components/neutral-pages";

/** Etkinlik içindeki hata ekranı: maskotsuz. */
export default function EventError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <NeutralError digest={error.digest} retry={retry} />;
}
