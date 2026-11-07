// Fark edene küçük tebessümler. Hiçbiri teslim, kilit ya da kayıt durumunu etkilemez.

/** Bazı eser numaralarının üstüne gelince görünen not. */
const EXHIBIT_NOTES: Record<number, string> = {
  7: "Mühür. Mühür Bond.",
};

export function exhibitNote(n: number): string | undefined {
  return EXHIBIT_NOTES[n];
}
