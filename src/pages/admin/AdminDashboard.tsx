import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  Plus,
  Pencil,
  Trash2,
  FileQuestion,
  ChevronRight,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  LogOut,
  ArrowLeft,
  Users,
  Signpost,
  Globe,
} from 'lucide-react';
import { api } from '@/lib/db';
import { useAuth } from '@/context/AuthContext';
import type { Series } from '@/types';
import SeriesFormModal from '@/components/admin/SeriesFormModal';

type SeriesWithCount = import('@/types').SeriesWithCount & { questionCount: number };

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const [series, setSeries] = useState<SeriesWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Series | null>(null);
  const [sitePublic, setSitePublic] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ site_public: boolean }>('/settings/public').then((res) => {
      if (!res.error) setSitePublic(res.data?.site_public ?? false);
    });
  }, []);

  async function togglePublic() {
    const next = !sitePublic;
    const res = await api.put('/settings', { site_public: next });
    if (!res.error) setSitePublic(next);
  }

  async function loadSeries() {
    setLoading(true);
    const res = await api.get<SeriesWithCount[]>('/series?all=true');
    if (res.error) {
      setError('Unable to load series.');
      setLoading(false);
      return;
    }
    const withCounts = res.data.map((s) => ({ ...s, questionCount: s.question_count }));
    setSeries(withCounts);
    setLoading(false);
  }

  useEffect(() => {
    loadSeries();
  }, []);

  async function handleDelete() {
    if (!deleteConfirm) return;
    const res = await api.del(`/series/${deleteConfirm.id}`);
    if (res.error) {
      setError('Failed to delete series.');
    } else {
      setDeleteConfirm(null);
      loadSeries();
    }
  }

  async function toggleActive(s: SeriesWithCount) {
    await api.put(`/series/${s.id}`, {
      title: s.title,
      description: s.description,
      is_active: !s.is_active,
      category: s.category,
      pass_score: s.pass_score,
      required_questions: s.required_questions,
    });
    loadSeries();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-md">
              <Car className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Admin Dashboard</h1>
              <p className="text-xs text-slate-500">Code de la Route — Catégorie B</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/students"
              className="text-sm text-slate-600 hover:text-primary-600 px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Students</span>
            </Link>
            <Link
              to="/admin/signs"
              className="text-sm text-slate-600 hover:text-primary-600 px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors flex items-center gap-1.5"
            >
              <Signpost className="w-4 h-4" />
              <span className="hidden sm:inline">Panneaux</span>
            </Link>
            <Link
              to="/"
              className="text-sm text-slate-600 hover:text-primary-600 px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Site</span>
            </Link>
            <button
              onClick={signOut}
              className="text-sm text-slate-600 hover:text-error-600 px-3 py-2 rounded-lg hover:bg-error-50 transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900">Mode public</p>
              <p className="text-sm text-slate-500">
                {sitePublic
                  ? 'La page d’accueil et les panneaux sont visibles sans connexion.'
                  : 'Seuls les élèves connectés voient la page d’accueil et les panneaux.'}
              </p>
            </div>
          </div>
          <button
            onClick={togglePublic}
            disabled={sitePublic === null}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
              sitePublic ? 'bg-success-500' : 'bg-slate-300'
            }`}
            aria-pressed={sitePublic ?? false}
            title={sitePublic ? 'Désactiver le mode public' : 'Activer le mode public'}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                sitePublic ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Series Management</h2>
            <p className="text-slate-500 text-sm mt-1">
              Create, edit, and manage exam series and their questions.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingSeries(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">New Series</span>
          </button>
        </div>

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

        {!loading && series.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <FileQuestion className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No series yet.</p>
            <p className="text-slate-400 text-sm mt-1">Click "New Series" to create your first one.</p>
          </div>
        )}

        {!loading && series.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {series.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md">
                      <FileQuestion className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{s.title}</h3>
                      <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full font-medium">
                        {s.category}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      s.is_active
                        ? 'text-success-600 hover:bg-success-50'
                        : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    title={s.is_active ? 'Active' : 'Inactive'}
                  >
                    {s.is_active ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </button>
                </div>

                {s.description && (
                  <p className="text-sm text-slate-500 mb-3 line-clamp-2">{s.description}</p>
                )}

                <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
                  <FileQuestion className="w-4 h-4" />
                  {s.questionCount} questions
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <Link
                    to={`/admin/series/${s.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    Manage
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => {
                      setEditingSeries(s);
                      setShowForm(true);
                    }}
                    className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(s)}
                    className="p-2 text-slate-500 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Series form modal */}
      {showForm && (
        <SeriesFormModal
          series={editingSeries}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadSeries();
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-error-50 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-error-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Delete series?</h3>
                <p className="text-sm text-slate-500">"{deleteConfirm.title}"</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              This will permanently delete the series and all its questions. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 bg-error-600 hover:bg-error-700 text-white rounded-xl font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
