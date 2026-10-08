import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  Clock,
  FileQuestion,
  Loader2,
  Lock,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { api } from '@/lib/db';
import SiteHeader from '@/components/SiteHeader';
import type { OfficialExamMeta, Readiness, RevisionSummary, SeriesWithCount } from '@/types';

export default function SeriesSelection() {
  const [series, setSeries] = useState<SeriesWithCount[]>([]);
  const [toReviewCount, setToReviewCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officialMeta, setOfficialMeta] = useState<OfficialExamMeta | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  useEffect(() => {
    async function loadSeries() {
      const res = await api.get<SeriesWithCount[]>('/series');
      if (res.error) {
        setError('Unable to load exam series. Please try again later.');
        setLoading(false);
        return;
      }
      setSeries(res.data);
      setLoading(false);
    }
    loadSeries();
    api.get<RevisionSummary>('/revision').then((res) => {
      if (!res.error) setToReviewCount(res.data.to_review.length);
    });
    api.get<OfficialExamMeta>('/exams/official/meta').then((res) => {
      if (!res.error) setOfficialMeta(res.data);
    });
    api.get<Readiness>('/readiness').then((res) => {
      if (!res.error) setReadiness(res.data);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <SiteHeader title="Code de la Route" subtitle="Catégorie B — Maroc" revisionCount={toReviewCount} />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Choisissez une série</h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Sélectionnez une série d'examens pour commencer votre test. Chaque série contient des
            questions avec un chronomètre et des scénarios routiers.
          </p>
        </div>

        {/* Official exam + readiness */}
        {(officialMeta || readiness) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {officialMeta && (
            <Link
              to="/exam/official"
              className="lg:col-span-2 group bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-6 text-white shadow-lg hover:shadow-2xl transition-all duration-300 animate-fade-in"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Trophy className="w-7 h-7 text-white" />
                </div>
                <span className="px-3 py-1 bg-white/20 text-white text-xs font-semibold rounded-full">
                  OFFICIEL
                </span>
              </div>
              <h3 className="text-xl font-bold mb-1">Examen officiel</h3>
              <p className="text-white/80 text-sm mb-4">
                {officialMeta.question_count} questions tirées de toute la banque · Score
                minimum {officialMeta.pass_score}/{officialMeta.question_count} · {officialMeta.timer_duration}s / question
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                Commencer la simulation
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          )}

          {readiness && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-success-50 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-success-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Prêt pour l'examen</p>
                  <p className="text-xs text-slate-500">
                    Basé sur tes {readiness.attempts_count > 0 ? 'dernières tentatives' : 'résultats'} et ta révision
                  </p>
                </div>
                {readiness.trend !== 'flat' && (
                  <span
                    className={`ml-auto flex items-center gap-1 text-xs font-semibold ${
                      readiness.trend === 'up' ? 'text-success-600' : 'text-error-600'
                    }`}
                  >
                    {readiness.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {readiness.trend === 'up' ? 'En hausse' : 'En baisse'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mb-3">
                <span className="text-4xl font-extrabold text-slate-900 tabular-nums">
                  {readiness.readiness_pct}%
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-3.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      readiness.readiness_pct >= 70
                        ? 'bg-success-500'
                        : readiness.readiness_pct >= 40
                        ? 'bg-warning-500'
                        : 'bg-error-500'
                    }`}
                    style={{ width: `${readiness.readiness_pct}%` }}
                  />
                </div>
              </div>
              <p className="text-sm text-slate-500">
                {readiness.readiness_pct >= 70
                  ? 'Prêt — tu as toutes les chances de réussir.'
                  : readiness.readiness_pct >= 40
                  ? 'Bien parti — continue les séries et la révision.'
                  : 'En route — entraîne-toi encore avant l’examen officiel.'}
                {readiness.to_review > 0 && (
                  <span className="mt-1 block text-xs text-warning-600">
                    {readiness.to_review} question{readiness.to_review > 1 ? 's' : ''} à revoir
                  </span>
                )}
              </p>
            </div>
          )}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-slate-400 mt-3">Chargement des séries...</p>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto bg-error-50 border border-error-200 rounded-xl p-6 text-center">
            <p className="text-error-700 font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && series.length === 0 && (
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-10 text-center">
            <FileQuestion className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Aucune série disponible pour le moment.</p>
            <p className="text-slate-400 text-sm mt-1">Veuillez revenir plus tard.</p>
          </div>
        )}

        {!loading && !error && series.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {series.map((s) => {
              const questionCount = s.question_count;
              const incomplete =
                s.required_questions > 0 && (questionCount ?? 0) < s.required_questions;
              const requiredLabel =
                s.required_questions > 0 ? `${s.required_questions}` : null;
              const cardInner = (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                      <FileQuestion className="w-7 h-7 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full">
                      {s.category}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1 group-hover:text-primary-700 transition-colors">
                    {s.title}
                  </h3>
                  {s.description && (
                    <p className="text-sm text-slate-500 mb-4 line-clamp-2">{s.description}</p>
                  )}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <FileQuestion className="w-4 h-4" />
                        {questionCount}/{requiredLabel ?? '∞'} questions
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        ~{Math.ceil((questionCount * 20) / 60)} min
                      </span>
                    </div>
                    {incomplete ? (
                      <Lock className="w-5 h-5 text-slate-300" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                    )}
                  </div>
                </>
              );
              if (incomplete) {
                return (
                  <div
                    key={s.id}
                    className="group bg-white rounded-2xl border border-slate-200 p-6 opacity-70 cursor-not-allowed select-none animate-fade-in"
                    title={`Série incomplète — ${questionCount}/${requiredLabel ?? '?'} questions`}
                  >
                    {cardInner}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-sm font-medium text-slate-400">
                      <Lock className="w-4 h-4" />
                      <span>
                        Incomplète ({questionCount}/{requiredLabel} questions) — En cours de
                        préparation
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <Link
                  key={s.id}
                  to={`/exam/${s.id}`}
                  className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-primary-300 hover:shadow-xl transition-all duration-300 animate-fade-in"
                >
                  {cardInner}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
