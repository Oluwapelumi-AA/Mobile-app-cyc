import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { local } from "./storage";
import type { ResourceDetail } from "./types";

const KEY = "cyc.downloads";

export type Download = {
  resource_id: string;
  title: string;
  author_name: string | null;
  kind: string;
  uri: string;
  size: number;
  saved_at: string;
};

export const listDownloads = () => local.getJSON<Download[]>(KEY, []);

export async function findDownload(resourceId: string) {
  const all = await listDownloads();
  return all.find((d) => d.resource_id === resourceId) ?? null;
}

/** Save a sermon's file on the phone so it plays offline. */
export async function downloadResource(r: ResourceDetail): Promise<Download> {
  if (Platform.OS === "web") throw new Error("Downloads work in the phone app.");
  if (!r.file_url) throw new Error("This item has no file to download.");
  const dir = new Directory(Paths.document, "downloads");
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = (r.file_content_type?.split("/")[1] ?? "bin").replace("mpeg", "mp3").split(";")[0];
  const target = new File(dir, `${r.id}.${ext}`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(r.file_url, target);
  const entry: Download = {
    resource_id: r.id,
    title: r.title,
    author_name: r.author_name,
    kind: r.kind,
    uri: file.uri,
    size: file.size ?? r.file_size_bytes ?? 0,
    saved_at: new Date().toISOString(),
  };
  const all = (await listDownloads()).filter((d) => d.resource_id !== r.id);
  await local.setJSON(KEY, [entry, ...all]);
  return entry;
}

export async function removeDownload(resourceId: string) {
  const all = await listDownloads();
  const item = all.find((d) => d.resource_id === resourceId);
  if (item) {
    try {
      const f = new File(item.uri);
      if (f.exists) f.delete();
    } catch {
      // Already gone.
    }
  }
  await local.setJSON(
    KEY,
    all.filter((d) => d.resource_id !== resourceId),
  );
}

export const formatBytes = (n: number) =>
  n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
