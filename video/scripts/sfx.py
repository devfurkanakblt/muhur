"""Açılış videosunun ses efektleri: kayıt yok, hepsi numpy/scipy ile sentezlenir.

Kullanım: python scripts/sfx.py public/sfx
"""
import os
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else "public/sfx"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def T(d):
    return np.arange(int(SR * d)) / SR


def env(n, a, d):
    """Doğrusal atak, üstel sönüm (saniye)."""
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1.0) * np.exp(-np.maximum(t - a, 0) / d)


def bp(x, lo, hi, o=2):
    return sosfilt(butter(o, [lo, hi], "bandpass", fs=SR, output="sos"), x)


def lp(x, f, o=2):
    return sosfilt(butter(o, f, "lowpass", fs=SR, output="sos"), x)


def hp(x, f, o=2):
    return sosfilt(butter(o, f, "highpass", fs=SR, output="sos"), x)


def chirp(f0, f1, d, curve=6):
    t = T(d)
    f = f1 + (f0 - f1) * np.exp(-curve * t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def room(x, dur, mix, lpf=5000):
    """Kısa, yumuşak oda yankısı."""
    n = int(SR * dur)
    ir = lp(rng.standard_normal(n), lpf) * np.exp(-np.arange(n) / SR / (dur / 6))
    y = np.zeros(len(x) + n)
    y[: len(x)] = x
    wet = np.zeros(len(y))
    c = fftconvolve(x, ir)[: len(y)]
    wet[: len(c)] = c
    wet /= np.max(np.abs(wet)) + 1e-9
    return y + mix * wet * np.max(np.abs(x))


def save(name, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.9
    fade = int(0.006 * SR)
    x[-fade:] *= np.linspace(1, 0, fade)
    wavfile.write(os.path.join(OUT, name + ".wav"), SR, (x * 32767).astype(np.int16))


# pop: perdesi düşen kabarcık
d = 0.16
x = chirp(1400, 380, d, 7) * env(int(SR * d), 0.002, 0.045)
x += 0.25 * chirp(2800, 760, d, 7) * env(int(SR * d), 0.001, 0.02)
save("pop", x)

# whoosh: merkez frekansı süpürülen bant geçiren gürültü
d = 0.7
n = int(SR * d)
noise = rng.standard_normal(n)
y = np.zeros(n)
B = 512
for i in range(0, n, B):
    p = i / n
    fc = 300 + 2600 * np.sin(np.pi * p) ** 1.5
    seg = noise[max(0, i - 2048) : i + B]
    y[i : i + B] = bp(seg, fc * 0.6, min(fc * 1.6, 18000))[-len(noise[i : i + B]) :]
y *= np.sin(np.pi * np.linspace(0, 1, n)) ** 2
save("whoosh", y)

# tik: arayüz dokunuşu
d = 0.05
n = int(SR * d)
save("tik", bp(rng.standard_normal(n), 1800, 7000) * env(n, 0.0003, 0.006) + 0.5 * np.sin(2 * np.pi * 900 * T(d)) * env(n, 0.0005, 0.01))

# ding: iki notalı bildirim zili
d = 1.0
n = int(SR * d)
t = T(d)
a1 = sum(a * np.sin(2 * np.pi * f * t) * env(n, 0.002, dc) for f, a, dc in [(1318.5, 1, 0.35), (2637, 0.35, 0.15), (3955, 0.12, 0.08)])
a2 = sum(a * np.sin(2 * np.pi * f * t) * env(n, 0.002, dc) for f, a, dc in [(1760, 1, 0.4), (3520, 0.3, 0.15)])
off = int(0.11 * SR)
y = a1.copy()
y[off:] += a2[: n - off]
save("ding", room(y, 0.6, 0.15))

# cam: kayan vitrin camı, sonunda yumuşak oturma
d = 1.4
n = int(SR * d)
s = bp(rng.standard_normal(n), 2500, 9000) * np.sin(np.pi * np.linspace(0, 1, n)) ** 0.8 * 0.35
ring = np.sin(2 * np.pi * 3150 * T(d)) * 0.04 * np.sin(np.pi * np.linspace(0, 1, n))
clunk = np.zeros(n)
k = int(SR * 1.32)
clunk[k:] = np.sin(2 * np.pi * 140 * T((n - k) / SR)) * env(n - k, 0.001, 0.04)
save("cam", room(s + ring + clunk * 0.9, 0.5, 0.15))

# tak: ahşap masaya vurulan ağır lastik mühür (tok ve kalın)
rng = np.random.default_rng(11)
d = 0.7
n = int(SR * d)
t = T(d)
f = 48 + 110 * np.exp(-t / 0.025)
sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.0015, 0.16)
knock = bp(rng.standard_normal(n), 120, 420, 3) * env(n, 0.0008, 0.05) * 1.6
res = sum(a * np.sin(2 * np.pi * fr * t) * env(n, 0.001, dc) for fr, a, dc in [(196, 0.5, 0.07), (287, 0.3, 0.05), (410, 0.15, 0.035)])
hit = lp(rng.standard_normal(n), 2200) * env(n, 0.0004, 0.008) * 0.5
x = sub * 1.0 + knock * 2.6 + res * 1.8 + hit
x = np.tanh(1.8 * x / np.max(np.abs(x)))
save("tak", lp(room(x, 0.45, 0.10, 1800), 6000))

# konfeti: konfeti patlatıcısı + yere dağılan kâğıt hışırtısı (tonal ses yok)
d = 1.6
n = int(SR * d)
t = T(d)
bang = bp(rng.standard_normal(n), 180, 3500, 2) * env(n, 0.0005, 0.018) * 1.4
bang += np.sin(2 * np.pi * np.cumsum(90 + 160 * np.exp(-t / 0.01)) / SR) * env(n, 0.001, 0.05) * 0.9
rust = np.zeros(n)
for _ in range(900):
    s0 = int(min(rng.exponential(0.35), 1.45) * SR) + int(0.03 * SR)
    if s0 >= n - 200:
        continue
    m = int(rng.uniform(0.0015, 0.006) * SR)
    amp = rng.uniform(0.15, 1) * np.exp(-s0 / SR / 0.55)
    rust[s0 : s0 + m] += rng.standard_normal(m) * np.hanning(m) * amp
rust = bp(rust, 1500, 9000, 2)
hiss = bp(rng.standard_normal(n), 2500, 8000) * env(n, 0.05, 0.4) * 0.08
save("konfeti", room(bang + rust * 0.9 + hiss, 0.35, 0.12, 5000))

print("ses efektleri:", sorted(os.listdir(OUT)))
