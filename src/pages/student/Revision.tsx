import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Target,
} from 'lucide-react';
import { api } from '@/lib/db';
import SiteHeader from '@/components/SiteHeader';
import type { RevisionSummary } from '@/types';

type Tab = 'to_review' | 'corrected';

function attemptLabel(n: number): string {
  return n === 1 ? '1re' : `${n}e`;
}

export default function Revision() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<RevisionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('to_review');

  useEffect(() => {
    async function load() {
      const res = await api.get<RevisionSummary>('/revision');
      if (res.error) {
        setError('Unable to load your revision list.');
        setLoading(false);
        return;
      }
      setSummary(res.data);
      setLoading(false);
    }
    load();
  }, []);

  const toReview = summary?.to_review ?? [];
  const corrected = summary?.corrected ?? [];
  const weakAreas = summary?.weak_areas ?? [];
  const maxWrong = weakAreas.length > 0 ? Math.max(...weakAreas.map((w) => w.wrong_total)) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <SiteHeader title="Mes erreurs" subtitle="Revois les questions que tu as manquées" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-slate-400 mt-3">Chargement...</p>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto bg-error-50 border border-error-200 rounded-xl p-6 text-center">
            <p className="text-error-700 font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && summary && (
          <>
            {weakAreas.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 animate-fade-in">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 bg-error-50 rounded-xl flex items-center justify-center">
                    <Target className="w-6 h-6 text-error-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Points faibles</p>
                    <p className="text-sm text-slate-500">
                      Tes catégories où tu rates le plus de questions
                    </p>
                  </div>
                </div>
                <ul className="space-y-4">
                  {weakAreas.map((w) => (
                    <li key={w.category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold text-slate-700">
                          Catégorie {w.category}
                        </span>
                        <span className="text-xs text-slate-500">
                          {w.question_count} question{w.question_count > 1 ? 's' : ''} ·{' '}
                          {w.wrong_total} erreur{w.wrong_total > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-error-500 to-warning-500 rounded-full transition-all duration-700"
                          style={{ width: `${maxWrong > 0 ? (w.wrong_total / maxWrong) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setTab('to_review')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all border ${
                  tab === 'to_review'
                    ? 'bg-primary-600 border-primary-600 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-primary-300'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                À revoir ({toReview.length})
              </button>
              <button
                onClick={() => setTab('corrected')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all border ${
                  tab === 'corrected'
                    ? 'bg-success-600 border-success-600 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-success-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Corrigées ({corrected.length})
              </button>
            </div>

            {tab === 'to_review' && (
              <>
                {toReview.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center animate-fade-in">
                    <CheckCircle2 className="w-12 h-12 text-success-400 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">Rien à revoir pour l'instant!</p>
                    <p className="text-slate-400 text-sm mt-1">
                      Ton travail est à jour — continue avec les séries.
                    </p>
                    <Link
                      to="/"
                      className="mt-6 inline-flex px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
                    >
                      Aller aux séries
                    </Link>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 animate-fade-in">
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                      <div className="w-12 h-12 bg-warning-50 rounded-xl flex items-center justify-center">
                        <BookOpen className="w-6 h-6 text-warning-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-900">
                          {toReview.length} question{toReview.length > 1 ? 's' : ''} à revoir
                        </p>
                        <p className="text-sm text-slate-500">
                          Passe une session pour les retravailler
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          navigate('/revision/exam', { state: { questions: toReview } })
                        }
                        className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors shadow-md flex items-center gap-2"
                      >
                        <BookOpen className="w-4 h-4" />
                        Commencer
                      </button>
                    </div>

                    <ul className="space-y-2">
                      {toReview.map((q) => (
                        <li
                          key={q.id}
                          className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5"
                        >
                          <span className="w-7 h-7 rounded-full bg-warning-100 text-warning-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {q.wrong_count}
                          </span>
                          <p className="flex-1 text-sm text-slate-700 line-clamp-2 min-w-0">
                            {q.question_text}
                          </p>
                          {q.series_title && (
                            <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full font-medium flex-shrink-0">
                              {q.series_title}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {tab === 'corrected' && (
              <>
                {corrected.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center animate-fade-in">
                    <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">Aucune question corrigée pour l'instant.</p>
                    <p className="text-slate-400 text-sm mt-1">
                      Les questions que tu réussis en révision apparaîtront ici.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 animate-fade-in">
                    <ul className="space-y-2">
                      {corrected.map((q) => (
                        <li
                          key={q.id}
                          className="flex items-center gap-3 bg-success-50 rounded-xl px-3 py-2.5"
                        >
                          <CheckCircle2 className="w-5 h-5 text-success-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 line-clamp-2">{q.question_text}</p>
                            {q.corrected_at && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                Obtenue à la {attemptLabel(q.wrong_count + 1)} fois ·{' '}
                                {new Date(q.corrected_at).toLocaleDateString('fr-FR')}
                              </p>
                            )}
                          </div>
                          {q.series_title && (
                            <span className="text-xs px-2 py-0.5 bg-success-100 text-success-700 rounded-full font-medium flex-shrink-0">
                              {q.series_title}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}