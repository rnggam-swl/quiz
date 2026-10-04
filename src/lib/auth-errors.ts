import { z } from "zod";

export const MIN_PASSWORD = 8;

export const newPasswordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD, `Password minimal ${MIN_PASSWORD} karakter.`).max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Konfirmasi password tidak sama.",
    path: ["confirm"],
  });

/** Supabase auth error codes → messages people understand. */
export function authMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "Email atau password salah.";
    case "email_not_confirmed":
      return "Email belum dikonfirmasi. Cek kotak masuk kamu.";
    case "user_already_exists":
    case "email_exists":
      return "Email ini sudah terdaftar. Silakan masuk.";
    case "weak_password":
      return "Password terlalu lemah. Pakai kombinasi huruf dan angka.";
    case "same_password":
      return "Password baru harus berbeda dari password lama.";
    case "reauthentication_needed":
    case "session_not_found":
      return "Sesi kamu sudah lama. Keluar lalu masuk lagi, kemudian coba ulang.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    case "signup_disabled":
      return "Pendaftaran sedang ditutup.";
    default:
      return "Terjadi kesalahan. Coba lagi.";
  }
}
