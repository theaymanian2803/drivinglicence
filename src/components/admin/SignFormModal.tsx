import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import { api } from '@/lib/db';
import { SIGN_CATEGORIES } from '@/types';
import type { TrafficSign } from '@/types';

interface Props {
  sign: TrafficSign | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function SignFormModal({ sign, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(sign?.title ?? '');
  const [category, setCategory] = useState(sign?.category ?? SIGN_CATEGORIES[0]);
  const [imageUrl, setImageUrl] = useState(sign?.image_url ?? '');
  const [description, setDescription] = useState(sign?.description ?? '');
  const [scenarioImageUrl, setScenarioImageUrl] = useState(sign?.scenario_image_url ?? '');
  const [isActive, setIsActive] = useState(sign?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sign) {
      setTitle(sign.title);
      setCategory(sign.category);
      setImageUrl(sign.image_url);
      setDescription(sign.description);
      setScenarioImageUrl(sign.scenario_image_url ?? '');
      setIsActive(sign.is_active);
    }
  }, [sign]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Titre requis.');
      return;
    }
    if (!imageUrl.trim()) {
      setError("L'image du panneau est requise.");
      return;
    }
    if (!description.trim()) {
      setError('La signification est requise.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      category,
      image_url: imageUrl.trim(),
      description: description.trim(),
      scenario_image_url: scenarioImageUrl.trim() || null,
      is_active: isActive,
    };

    let res;
    if (sign) {
      res = await api.put<TrafficSign>(`/signs/${sign.id}`, payload);
    } else {
      res = await api.post<TrafficSign>('/signs', payload);
    }
    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">
            {sign ? 'Modifier le panneau' : 'Ajouter un panneau'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <ImageUpload value={imageUrl} onChange={setImageUrl} label="Image du panneau" hint="Obligatoire" />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nom du panneau <span className="text-error-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Cédez le passage"
              dir="auto"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Catégorie</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
              {SIGN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Signification <span className="text-error-500">*</span>
            </label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              dir="auto"
              placeholder="Explique ce que ce panneau signifie pour le conducteur..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          <ImageUpload
            value={scenarioImageUrl}
            onChange={setScenarioImageUrl}
            label="Image de situation (facultatif)"
            hint="Une image montrant le panneau en situation sur la route."
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Statut</label>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`w-full px-4 py-2.5 rounded-xl font-medium transition-all border ${
                isActive
                  ? 'bg-success-50 border-success-200 text-success-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              {isActive ? 'Visible' : 'Masqué'}
            </button>
          </div>

          <div className="flex gap-3 pt-2 sticky bottom-0 bg-white -mx-6 px-6 py-4 border-t border-slate-100 -mb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : sign ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
