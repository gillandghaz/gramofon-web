// Menentukan apakah sebuah file adalah "video" atau "audio".
//
// Di Android (dan untuk beberapa format seperti mkv/flac/opus/m4a, atau file
// dari WhatsApp/Google Drive) browser sering mengisi file.type KOSONG atau
// "application/octet-stream". Kalau hanya mengandalkan MIME, file sah ditolak
// dengan pesan "Hanya file video atau musik...". Jadi MIME dipakai dulu, lalu
// ekstensi nama file sebagai cadangan.
const AUDIO_EXT = new Set([
  "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "wma", "aiff", "aif", "amr", "weba", "mka",
]);
const VIDEO_EXT = new Set([
  "mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "flv", "3gp", "ogv", "mpg", "mpeg", "ts",
]);

export function mediaKind(file) {
  const mime = (file?.type || "").toLowerCase();
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  const ext = (file?.name || "").split(".").pop().toLowerCase();
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}
