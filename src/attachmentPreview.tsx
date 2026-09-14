import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api";

export function isImageAttachmentPath(path: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(path);
}

export function fileSrcForPath(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

export function AttachmentPreview({ path, className }: { path: string; className?: string }) {
  const name = path.split("/").pop() || "Attachment";
  const src = fileSrcForPath(path);
  const image = isImageAttachmentPath(path) && !!src;
  return (
    <button
      type="button"
      className={className || "attach-chip"}
      title={name}
      onClick={() => void api.openPath(path)}
    >
      {image ? <img src={src} alt={name} /> : <span>{name}</span>}
    </button>
  );
}
