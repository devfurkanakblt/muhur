"""Açılış videosunun müziği: "Electrodoodle"ın (Kevin MacLeod, CC BY 4.0) ilk 1:52'sinden ölçü ölçü kurgulanır.

Parça 120 BPM, 4/4: bir ölçü 2 sn = 60 kare. Ölçü k, kaynakta 0,03 + 2k saniyede başlar.
1:52 = 56. ölçünün başı; 0–55 dışındaki ölçüler kullanılmaz.
Kaynak bölümleri: A 0–11 · B 12–15 · C 16–23 · D 24–31 · ara (sakin) 32–43 · B 44–47 · A 48–55.
PLAN, video/src/Video.tsx'teki sahne sürelerine göre dizilmiştir; süreleri değiştirirsen burayı da güncelle.

Kullanım: python scripts/muzik.py <Electrodoodle.mp3> public/muzik/electrodoodle-acilis.mp3
"""
import subprocess
import sys

import numpy as np

SR = 44100
BAR = 2 * SR
PHASE = 0.03
FADE = int(0.01 * SR)  # birleşimlerde 10 ms çapraz geçiş
# MP3 kodlayıcısı başa ~42 ms sessizlik ekliyor ve Remotion bunu kırpmıyor (render edilen videoda ölçüldü).
# Dosya o kadar önden başlar ki vuruşlar kareyle aynı anda duyulsun.
LEAD = 0.042

# (kaynakta ilk ölçü, son ölçü): videoda sırayla çalar. Yorumlar videodaki ölçüyü ve sahneyi gösterir.
PLAN = [
    (0, 11),   # 0   S01 Merhaba, S02 Başlık (logo patlaması 6. ölçüde), S03 Doğa
    (12, 15),  # 12
    (16, 23),  # 16  S04 Görev
    (20, 21),  # 24
    (24, 31),  # 26  S06 Kural 1
    (27, 31),  # 34
    (32, 35),  # 39  S08 Gece: sakin bölüm
    (44, 47),  # 43  S10 Ödül
    (48, 55),  # 47  S11 Tanışma
    (12, 15),  # 55  S13 Repo
    (16, 23),  # 59  S14 Form
    (24, 31),  # 67  S16 Teslim
    (38, 43),  # 75  S17 Son saniye: gerilim, 80. ölçüde boşluk (cam iner)
    (44, 47),  # 81  S18 mühür vuruşu = drop
    (48, 51),  # 85  S19 Sonrası
    (12, 15),  # 89  S20 Telegram
    (16, 23),  # 93
    (48, 52),  # 101 S21 "Hazırsan… saat başlasın!" — final
]
FADE_OUT_BARS = 2


def main(src, dst):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", src, "-t", "113", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
        check=True, capture_output=True,
    ).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2)
    start = lambda k: round((PHASE + LEAD + 2 * k) * SR)

    total = sum(b - a + 1 for a, b in PLAN) * BAR
    # Her parça ölçü sınırının FADE/2 öncesinden başlar; `out` başta FADE/2 kadar fazladan tutulur, sonra kırpılır.
    h = FADE // 2
    out = np.zeros((total + FADE, 2), np.float32)
    ramp = np.sin(np.linspace(0, np.pi / 2, FADE))[:, None] ** 2
    pos = 0
    for a, b in PLAN:
        assert 0 <= a <= b <= 55
        n = (b - a + 1) * BAR
        seg = x[max(0, start(a) - h) : start(a) + n + h].copy()
        seg = np.pad(seg, ((FADE + n - len(seg), 0), (0, 0)))
        seg[:FADE] *= ramp
        seg[-FADE:] *= ramp[::-1]
        out[pos : pos + len(seg)] += seg
        pos += n
    out = out[h : h + total]
    fo = FADE_OUT_BARS * BAR
    out[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo))[:, None]

    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", "-c:a", "libmp3lame", "-b:a", "256k", dst],
        input=out.tobytes(), check=True,
    )
    print(f"{dst}: {total / SR:.2f} sn, {total // BAR} ölçü = {total * 30 // SR} kare")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
