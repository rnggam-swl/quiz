import { checkMediaFile, mediaKindOf, mediaPath } from "@/lib/media";
import type { MediaRef } from "@/questions/shared";

import { createClient } from "./client";

/** Upload a question/cover file to the public `quiz-media` bucket under the owner's folder. */
export async function uploadQuizMedia(
  file: File,
  ownerId: string,
  quizId: string,
): Promise<MediaRef> {
  const problem = checkMediaFile(file);
  const kind = mediaKindOf(file.type);
  if (problem || !kind) throw new Error(problem ?? "Format tidak didukung.");

  const supabase = createClient();
  const path = mediaPath(ownerId, quizId, file.type);
  const { error } = await supabase.storage.from("quiz-media").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("quiz-media").getPublicUrl(path);
  return { kind, url: data.publicUrl };
}
