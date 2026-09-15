"use client";

// Context ini membaca status login Firebase Auth DAN dokumen profil user di
// Firestore (termasuk field "role"), lalu membagikannya ke seluruh komponen
// lewat useAuth(). Ini satu-satunya tempat "apakah user ini admin?" dibaca
// di sisi client — komponen lain tinggal memanggil useAuth().isAdmin.

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthContext = createContext({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dengarkan status login Firebase Auth.
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    // Dengarkan dokumen profil user secara realtime (termasuk field role) —
    // jadi kalau admin lain mengubah role Anda, UI ikut update tanpa reload.
    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
    return () => unsubProfile();
  }, [user]);

  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
