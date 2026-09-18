import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const CONTACTS_DOC = doc(db, "settings", "contacts");

export const DEFAULT_CONTACTS = [
  { id: "github", label: "GitHub", value: "" },
  { id: "email", label: "Email", value: "" },
  { id: "phone", label: "Telepon", value: "" },
];

// Realtime -- begitu admin menyimpan perubahan, semua pengguna yang
// sedang membuka tab Contact langsung melihat perubahannya tanpa reload.
export function subscribeContacts(callback) {
  return onSnapshot(CONTACTS_DOC, (snap) => {
    if (!snap.exists()) {
      callback({ items: DEFAULT_CONTACTS, description: "" });
      return;
    }
    const data = snap.data();
    callback({
      items: Array.isArray(data.items) && data.items.length ? data.items : DEFAULT_CONTACTS,
      description: data.description || "",
    });
  });
}

export async function saveContacts({ items, description }) {
  await setDoc(CONTACTS_DOC, { items, description: description || "" }, { merge: true });
}

// Dipakai untuk menampilkan value kontak sebagai tautan yang masuk akal
// (email -> mailto:, nomor telepon -> tel:, URL -> apa adanya) tanpa
// memaksa admin mengetik prefix itu secara manual.
export function contactHref(value) {
  const v = (value || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^mailto:|^tel:/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^\+?[0-9][0-9 ()-]{5,}$/.test(v)) return `tel:${v.replace(/[^0-9+]/g, "")}`;
  return null; // teks biasa, bukan tautan
}
