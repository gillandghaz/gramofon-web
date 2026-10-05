// Perhitungan tinggi bar visualizer "Audio Only" dari data AnalyserNode.
// Dipisah dari komponen supaya bisa diuji dan dipakai sama di semua perangkat.
//
// Prinsip:
//  - Sumber data SELALU suara asli (AnalyserNode di depan volume), jadi bar
//    hanya bergerak kalau ada suara, dan mengikuti pita frekuensinya.
//  - Dikerjakan dalam desibel dengan "AGC": puncak terbaru melebar turun
//    pelan (~6 dB/detik), jadi lagu keras maupun pelan sama-sama memakai
//    seluruh tinggi bar, tanpa mentok penuh.
//  - Kemiringan spektrum (bass jauh lebih kuat dari treble) dikompensasi
//    supaya nada tinggi tidak mati.
//  - Fluktuasi: komponen "hentakan" (naiknya level di atas rata-rata lambat
//    pita itu) ditambahkan, jadi bar melompat tiap ketukan/nada baru.

export const VIZ_MIN = 0.04;
export const VIZ_MAX = 0.86;

export function createVizState(barCount) {
  return {
    n: barCount,
    ceil: -40, // puncak dB terbaru (AGC)
    avg: new Float32Array(barCount), // rata-rata lambat tiap pita
    cur: new Float32Array(barCount).fill(VIZ_MIN),
    edges: null,
    edgesKey: "",
    silentFrames: 0,
  };
}

function buildEdges(state, binCount, binHz, fmin, fmax) {
  const N = state.n;
  const e = new Float32Array(N + 1);
  const ratio = fmax / fmin;
  for (let i = 0; i <= N; i++) e[i] = Math.min(binCount - 1, (fmin * Math.pow(ratio, i / N)) / binHz);
  return e;
}

// Ubah data byte (0..255 antara minDb..maxDb) ke dB bila float tidak tersedia.
export function bytesToDb(bytes, out, minDb, maxDb) {
  const span = maxDb - minDb;
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] === 0 ? -140 : minDb + (bytes[i] / 255) * span;
}

/**
 * db: Float32Array dB per bin (panjang = frequencyBinCount)
 * sampleRate, fftSize: dari analyser/context
 * Mengembalikan state.cur (tinggi 0..1 tiap bar, sudah dibatasi VIZ_MIN..VIZ_MAX)
 */
export function stepViz(state, db, sampleRate, fftSize) {
  const N = state.n;
  const binCount = db.length;
  const binHz = sampleRate / fftSize;
  const key = binCount + "|" + sampleRate;
  if (!state.edges || state.edgesKey !== key) {
    state.edges = buildEdges(state, binCount, binHz, 50, Math.min(16000, sampleRate / 2 - 200));
    state.edgesKey = key;
  }
  const edges = state.edges;
  const FLOOR = -110;
  const RANGE = 40; // dB lebar jendela tampilan di bawah puncak
  const levelsDb = new Float32Array(N);
  let top = -200;
  for (let i = 0; i < N; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    let a = Math.floor(lo);
    let b = Math.max(a, Math.ceil(hi) - 1);
    if (hi - lo < 1) {
      // pita lebih sempit dari satu bin: interpolasi di titik tengah
      const c = (lo + hi) / 2;
      const k = Math.floor(c);
      const f = c - k;
      levelsDb[i] = Math.max(FLOOR, db[k]) * (1 - f) + Math.max(FLOOR, db[Math.min(k + 1, binCount - 1)]) * f;
    } else {
      let mx = FLOOR;
      let sum = 0;
      let cnt = 0;
      for (let k = a; k <= Math.min(binCount - 1, b); k++) {
        const v = Math.max(FLOOR, db[k]);
        if (v > mx) mx = v;
        sum += v;
        cnt++;
      }
      levelsDb[i] = 0.55 * mx + 0.45 * (sum / Math.max(1, cnt));
    }
    // kompensasi kemiringan spektrum: +3 dB per oktaf di atas 100 Hz
    const centerHz = ((lo + hi) / 2) * binHz;
    levelsDb[i] += 3 * Math.log2(Math.max(centerHz, 50) / 100);
    if (levelsDb[i] > top) top = levelsDb[i];
  }

  // AGC: naik langsung, turun ~6 dB/detik (pada ~60 fps)
  if (top > state.ceil) state.ceil = top;
  else state.ceil = Math.max(top, state.ceil - 0.1);

  const silent = top < -95; // praktis tak ada suara
  state.silentFrames = silent ? state.silentFrames + 1 : 0;

  for (let i = 0; i < N; i++) {
    let target;
    if (silent) {
      target = VIZ_MIN;
      state.avg[i] *= 0.9;
    } else {
      const level = Math.min(1, Math.max(0, (levelsDb[i] - (state.ceil - RANGE)) / RANGE));
      const shaped = Math.pow(level, 1.7);
      const flux = Math.max(0, level - state.avg[i]);
      state.avg[i] += (level - state.avg[i]) * 0.12;
      const punch = Math.min(1, flux * 3.4);
      target = VIZ_MIN + (VIZ_MAX - VIZ_MIN) * Math.min(1, 0.6 * shaped + 0.75 * punch * (0.45 + 0.55 * level));
    }
    const k = target > state.cur[i] ? 0.8 : 0.3;
    state.cur[i] += (target - state.cur[i]) * k;
    if (state.cur[i] < VIZ_MIN) state.cur[i] = VIZ_MIN;
    if (state.cur[i] > VIZ_MAX) state.cur[i] = VIZ_MAX;
  }
  return state.cur;
}
