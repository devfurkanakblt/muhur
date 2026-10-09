/** Ekibe gösterilen repo sağlığı uyarıları. Admin işaretleri (etkinlik öncesi kod) ayrı tutulur. */
export const HEALTH_TEXT: Record<string, { title: string; fix: string }> = {
  erisilemiyor: {
    title: "Repona ulaşılamıyor.",
    fix: "Repo silinmiş, adı değişip erişilemez olmuş ya da private yapılmış olabilir. Public olduğundan emin ol; aksi halde mühür vurulamaz.",
  },
  bos: {
    title: "Varsayılan dal boş.",
    fix: "Önce varsayılan dala kodunu push et; ardından panelde kodunu teslim et.",
  },
  buyuk: {
    title: "Repo boyutu 40 MB üzerinde görünüyor.",
    fix: "Bu değer sıkıştırılmış ZIP boyutu değildir. Teslim ZIP'i en fazla 50 MB olabilir; büyük veri ve derleme dosyalarını repodan çıkarmayı düşün.",
  },
  "cok-buyuk": {
    title: "Repo 50 MB arşiv sınırını aşıyor.",
    fix: "Büyük dosyaları repodan çıkar; sınır aşılırsa yalnızca commit kaydı mühürlenir, kodun kopyası alınamayabilir.",
  },
};
