// EkoZekaBot stikır paketi: https://t.me/addstickers/muhur_by_EkoZekaBot
// Görseller assets/stickers/ altında. file_id değerleri bu bota özeldir; paket yeniden oluşturulursa güncellenmeli.
export const STICKER_SET = "muhur_by_EkoZekaBot";

export const STICKERS = {
  "muhur": "CAACAgQAAxUAAWrCcLUpyzFCn3SvkNYsVH8PfPlYAAK_HQACsqgRUj_sPUQ7ZDTfPQQ",
  "vitrinde": "CAACAgQAAxUAAWrCcLWhR912hhP7bMgsYrrRJgTaAAKIHwAC2uoRUkpp_tFvKA27PQQ",
  "duyuru": "CAACAgQAAxUAAWrCcLXacX2yPwq_YjitjI6dnRCBAAKlIAACThIRUgvstPYob4KnPQQ",
  "son-dakika": "CAACAgQAAxUAAWrCcLWGN53pMKBs5DQe8cZz-a-RAAImIgACNngRUiUhpGL9kQ3KPQQ",
  "tamam": "CAACAgQAAxUAAWrCcLWFv6M50jCsmjVKV_ZDbgXGAAJpIQACLekYUkY-OsUKBO2FPQQ",
  "oy": "CAACAgQAAxUAAWrCcLU5QsYpJFYR9gJxnJDD9rTsAAJxJAACEsQRUp-1CHuF5nrwPQQ",
  "kazanan": "CAACAgQAAxUAAWrCcLW9kI4jsd8EGxfiA3V9vQPoAAJHIwAD0BBSCOmmrBWRTaI9BA",
  "uykulu": "CAACAgQAAxUAAWrCcLWF7rf3qBEaPCu2GlSKk-bHAALJHQACnBMYUh1d5JdKx7ifPQQ",
  "pizza": "CAACAgQAAxUAAWrCcLXrhZ7q_ETsDwtIDaRUXBzpAAL-HgACiVMZUmyZEm4eiTLhPQQ",
  "kahve": "CAACAgQAAxUAAWrCcLUhKAxvGTBf__58MySgH88tAALgIgAC3uEZUiRCTTFNNNa0PQQ",
  "hackathon": "CAACAgQAAxUAAWrCcLXt-abkvGnvD0o_RtsRocRyAAIlIQAChkoQUi1FLhwDn7nlPQQ",
  "odakli": "CAACAgQAAxUAAWrCcLUWb03cNZc_gjgj4DaIVPFLAAINIwAC5psQUjptc3Fyv9_8PQQ",
} as const;

export type StickerId = keyof typeof STICKERS;
