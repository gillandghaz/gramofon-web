import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/server-auth";
import { signedUploadPayload, AVATAR_FOLDER, IMAGE_ALLOWED_FORMATS } from "@/lib/cloudinary-admin";

// Izin upload FOTO PROFIL ke Cloudinary (bukan lagi base64 di Firestore).
// Folder terkunci ke uid pemanggil, jadi tidak bisa menimpa foto orang lain.
export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    return NextResponse.json(
      signedUploadPayload({ folder: AVATAR_FOLDER(decoded.uid), allowedFormats: IMAGE_ALLOWED_FORMATS })
    );
  } catch (err) {
    return errorResponse(err, "profile photo sign-upload");
  }
}
