import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const CONTACTS_DOC = doc(db, "settings", "contacts");

// title kosong berarti "pakai value sendiri sebagai teks yang tampil".
export const DEFAULT_CONTACTS = [
  { id: "github", label: "GitHub", title: "", value: "" },
  { id: "email", label: "Email", title: "", value: "" },
  { id: "phone", label: "Telepon", title: "", value: "" },
];

export function subscribeContacts(callback) {
  return onSnapshot(CONTACTS_DOC, (snap) => {
    if (!snap.exists()) {
      callback({ items: DEFAULT_CONTACTS, description: "" });
      return;
    }
    const data = snap.data();
    const items =
      Array.isArray(data.items) && data.items.length
        ? data.items.map((it) => ({ title: "", ...it }))
        : DEFAULT_CONTACTS;
    callback({ items, description: data.description || "" });
  });
}

export async function saveContacts({ items, description }) {
  await setDoc(CONTACTS_DOC, { items, description: description || "" }, { merge: true });
}

// Dipakai untuk menampilkan value kontak sebagai tautan yang masuk akal
// (email -> mailto:, nomor telepon -> tel:, URL -> apa adanya, ATAU
// domain tanpa skema seperti "github.com/nama" -> otomatis ditambah
// "https://" di depannya) tanpa memaksa admin mengetik prefix manual.
export function contactHref(value) {
  const v = (value || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^mailto:|^tel:/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^\+?[0-9][0-9 ()-]{5,}$/.test(v)) return `tel:${v.replace(/[^0-9+]/g, "")}`;
  // Terlihat seperti domain/alamat web tanpa skema, mis. "github.com/x"
  // atau "www.contoh.com" -- anggap https:// secara implisit.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) return `https://${v}`;
  return null; // teks biasa, bukan tautan
}
