// Sintaks: [[https://contoh.com]] -> tautan (teks tampil = url-nya)
//          [[https://contoh.com|Klik di sini]] -> tautan dengan label kustom
//
// Dibangun manual (bukan dangerouslySetInnerHTML) supaya tidak ada celah
// injeksi HTML — hanya URL yang diizinkan (http/https/mailto) yang
// benar-benar dijadikan elemen <a>; selain itu tetap teks polos apa adanya.
export function parseMessageLinks(text) {
  const parts = [];
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[1].trim();
    const label = (match[2] || url).trim();
    const isSafeUrl = /^https?:\/\/|^mailto:/i.test(url);

    if (isSafeUrl) {
      parts.push(
        <a
          key={`link-${key++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="notif-link"
        >
          {label}
        </a>
      );
    } else {
      // Bukan URL yang dikenali/aman -> tampilkan apa adanya sebagai teks,
      // jangan dijadikan tautan (mencegah skema URL berbahaya seperti
      // "javascript:").
      parts.push(match[0]);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

// Untuk konteks PRATINJAU non-popup (dropdown notifikasi, daftar kelola
// notifikasi admin) -- sintaks [[url]] / [[url|label]] diganti jadi teks
// labelnya SAJA (tanpa tanda kurung siku), TANPA dijadikan elemen <a>
// yang bisa diklik. Tautan yang sungguh bisa diklik hanya ada di modal
// detail penuh (parseMessageLinks di atas).
export function stripLinkSyntax(text) {
  return (text || "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, url, label) =>
    (label || url).trim()
  );
}
