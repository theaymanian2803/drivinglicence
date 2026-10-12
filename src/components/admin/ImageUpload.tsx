import { useRef, useState } from 'react';
import { ImagePlus, Loader2, UploadCloud } from 'lucide-react';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
}

export function ImageUpload({ value, onChange, label, hint }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError('استخدم صورة PNG أو JPG أو WebP أو GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`حجم الصورة ${(file.size / 1024 / 1024).toFixed(1)} ميغابايت. الحد الأقصى 5 ميغابايت.`);
      return;
    }

    setUploading(true);
    try {
      const signRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });

      const signJson = await signRes.json().catch(() => null);
      if (!signRes.ok) {
        throw new Error(signJson?.error ?? 'تعذّر تجهيز الرفع.');
      }

      const { uploadUrl, publicUrl } = signJson.data as {
        uploadUrl: string;
        publicUrl: string;
      };

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error(`رفض التخزين عملية الرفع (${putRes.status}).`);
      }

      onChange(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الرفع.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {value ? (
        <div className="group relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          <img
            src={value}
            alt="معاينة"
            className="h-44 w-full object-contain"
            onError={() => setError('تعذّر تحميل هذه الصورة. ربما حُذفت.')}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-60"
            >
              {uploading ? 'جارٍ الرفع…' : 'استبدال'}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('');
                setError(null);
              }}
              disabled={uploading}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              حذف
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 transition-colors hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-600 disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm">جارٍ الرفع…</span>
            </>
          ) : (
            <>
              <UploadCloud className="h-7 w-7" />
              <span className="text-sm font-medium">انقر لإضافة صورة</span>
              <span className="text-xs">PNG أو JPG أو WebP أو GIF · 5 ميغابايت كحد أقصى</span>
            </>
          )}
        </button>
      )}

      {!value && !uploading && !error && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <ImagePlus className="h-3.5 w-3.5" />
          {hint ?? 'اختياري — سيظهر السؤال بدون صورة إذا لم تُضف أي صورة.'}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
