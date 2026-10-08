import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/db';
import type { TrafficSign } from '@/types';
import SignFormModal from '@/components/admin/SignFormModal';

export default function AdminSigns() {
  const [signs, setSigns] = useState<TrafficSign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSign, setEditingSign] = useState<TrafficSign | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TrafficSign | null>(null);

  async function loadSigns() {
    setLoading(true);
    const res = await api.get<TrafficSign[]>('/signs?all=true');
    if (res.error) {
      setError('Unable to load signs.');
      setLoading(false);
      return;
    }
    setSigns(res.data.map((s) => ({ ...s, is_active: !!s.is_active })));
    setLoading(false);
  }

  useEffect(() => {
    loadSigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleActive(s: TrafficSign) {
    await api.put(`/signs/${s.id}`, {
      title: s.title,
      category: s.category,
      image_url: s.image_url,
      description: s.description,
      scenario_image_url: s.scenario_image_url,
      is_active: !s.is_active,
    });
    loadSigns();
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    const res = await api.del(`/signs/${deleteConfirm.id}`);
    if (res.error) {
      setError('Failed to delete sign.');
    } else {
      setDeleteConfirm(null);
      loadSigns();
    }
  }

  async function moveSign(s: TrafficSign, direction: 'up' | 'down') {
    const idx = signs.findIndex((item) => item.id === s.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= signs.length) return;
    const reordered = [...signs];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const res = await api.patch('/signs/reorder', { ids: reordered.map((item) => item.id) });
    if (res.error) {
      setError('Failed to reorder signs.');
      return;
    }
    loadSigns();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/dashboard"
              className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Panneaux de signalisation</h1>
              <p className="text-xs text-slate-500">
                {signs.length} panneau{signs.length !== 1 ? 'x' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingSign(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Ajouter un panneau</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        )}

        {!loading && signs.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Aucun panneau pour le moment.</p>
            <p className="text-slate-400 text-sm mt-1">
              Clique sur "Ajouter un panneau" pour créer le premier.
            </p>
          </div>
        )}

        {!loading && signs.length > 0 && (
          <div className="space-y-3">
            {signs.map((s, idx) => (
              <div
                key={s.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {s.image_url ? (
                      <img
                        src={s.image_url}
                        alt={s.title}
                        className="w-16 h-16 rounded-lg object-contain border border-slate-200 bg-slate-50"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 truncate">{s.title}</h3>
                      <button
                        onClick={() => toggleActive(s)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          s.is_active
                            ? 'text-success-600 hover:bg-success-50'
                            : 'text-slate-400 hover:bg-slate-100'
                        }`}
                        title={s.is_active ? 'Visible' : 'Masqué'}
                      >
                        {s.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full font-medium">
                      {s.category}
                    </span>
                    <p className="text-sm text-slate-500 mt-2 line-clamp-2">{s.description}</p>
                    {s.scenario_image_url && (
                      <p className="flex items-center gap-1 text-xs text-success-600 mt-1">
                        <ImageIcon className="w-3 h-3" />
                        Image de situation
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveSign(s, 'up')}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveSign(s, 'down')}
                      disabled={idx === signs.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0 border-l border-slate-100 pl-2">
                    <button
                      onClick={() => {
                        setEditingSign(s);
                        setShowForm(true);
                      }}
                      className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(s)}
                      className="p-1.5 text-slate-500 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <SignFormModal
          sign={editingSign}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadSigns();
          }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-error-50 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-error-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Supprimer ce panneau ?</h3>
                <p className="text-sm text-slate-500">"{deleteConfirm.title}"</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Ce panneau sera définitivement supprimé. Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 bg-error-600 hover:bg-error-700 text-white rounded-xl font-medium transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
