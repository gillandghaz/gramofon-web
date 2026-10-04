import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/server-auth";

// Pemeriksaan sesi ringan yang dipanggil klien secara berkala. Server
// menanyakan ke Firebase (checkRevoked) apakah akun ini masih aktif; kalau
// akun sudah DINONAKTIFKAN di Firebase Console (atau token dicabut), jawabannya
// 401 + code "session-revoked" dan klien langsung logout -- tidak perlu
// menunggu token berumur sampai 1 jam habis.
export async function POST(request) {
  try {
    await requireUser(request, { requireProfile: false });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "auth session");
  }
}
