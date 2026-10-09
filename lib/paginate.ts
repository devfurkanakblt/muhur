type Page<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

/**
 * API satır sınırı (varsayılan 1000) sessizce eksik sonuç döndürmesin diye tüm kayıtları sayfalayarak okur.
 * Sorgu kararlı bir sırayla verilmeli; toplam, ilk sayfadaki tam sayımla karşılaştırılır.
 */
export async function selectAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  // Sunucu sayfa boyutundan küçük bir sınır uygularsa, dönen satır kadar ilerlenir.
  for (let from = 0; ; ) {
    const { data, error, count } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    if (expected === null) expected = count ?? null;
    const chunk = data ?? [];
    rows.push(...chunk);
    from += chunk.length;
    if (!chunk.length || (expected !== null ? rows.length >= expected : chunk.length < size)) break;
  }
  if (expected !== null && rows.length !== expected) {
    throw new Error(`Kayıt listesi eksik okundu (${rows.length}/${expected}).`);
  }
  return rows;
}
