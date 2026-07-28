import { useRef, useState } from "react";
import { Upload, Link as LinkIcon, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export function ImageUpload({
  value,
  onChange,
  label = "Imagem",
  shape = "square",
  folder = "misc",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  shape?: "square" | "circle";
  folder?: string;
}) {
  const [mode, setMode] = useState<"file" | "url">("file");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = value?.trim() || "";
  const previewCls =
    shape === "circle"
      ? "h-20 w-20 rounded-full object-cover border border-border"
      : "h-20 w-20 rounded-xl object-cover border border-border";

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Envie um arquivo de imagem.");
    if (file.size > 3 * 1024 * 1024) return toast.error("Imagem muito grande (máx 3 MB).");
    setUploading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) throw new Error("Faça login novamente.");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${uid}/${folder}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("brand-assets").upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("brand-assets")
        .createSignedUrl(path, TEN_YEARS);
      if (signErr) throw signErr;
      onChange(signed.signedUrl);
      toast.success("Imagem enviada!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium block">{label}</span>
      <div className="flex items-start gap-3 pt-3">

        {preview ? (
          <div className="relative shrink-0">
            <img src={preview} alt="" className={previewCls} />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-white grid place-items-center shadow"
              title="Remover"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className={`${previewCls} grid place-items-center bg-secondary text-muted-foreground`}>
            <ImageIcon className="h-6 w-6" />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("file")}
              data-selected={mode === "file"}
              className="chip !min-h-[36px] !py-1 text-xs"
            >
              <Upload className="h-3 w-3 mr-1 inline" /> Arquivo
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              data-selected={mode === "url"}
              className="chip !min-h-[36px] !py-1 text-xs"
            >
              <LinkIcon className="h-3 w-3 mr-1 inline" /> URL
            </button>
          </div>
          {mode === "file" ? (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-outline-brand !py-2 text-sm w-full disabled:opacity-60"
              >
                {uploading ? "Enviando..." : "Selecionar imagem"}
              </button>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou WEBP — até 3 MB.</p>
            </div>
          ) : (
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://..."
              className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}
