import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileQuestion,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/db';
import SiteHeader from '@/components/SiteHeader';
import type { ExamAttempt } from '@/types';

export default function StudentHistory() {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAttempts() {
      const res = await api.get<ExamAttempt[]>('/attempts');
      if (res.error) {
        setError('Unable to load your results.');
        setLoading(false);
        return;
      }
      setAttempts(res.data);
      setLoading(false);
    }
    loadAttempts();
  }, []);

  const passedCount = attempts.filter((a) => a.passed).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <SiteHeader title="Mes résultats" subtitle="Historique de vos examens" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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

        {!loading && !error && attempts.length === 0 && (
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-10 text-center">
            <FileQuestion className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Aucun résultat pour le moment.</p>
            <p className="text-slate-400 text-sm mt-1">
              Terminez un examen pour voir vos résultats ici.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
            >
              Aller aux séries
            </Link>
          </div>
        )}

        {!loading && !error && attempts.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white border border-slate-200 rounded-2xl py-5 text-center">
                <p className="text-3xl font-bold text-slate-900">{attempts.length}</p>
                <p className="text-xs text-slate-500 font-medium mt-1">Examens passés</p>
              </div>
              <div className="bg-success-50 border border-success-200 rounded-2xl py-5 text-center">
                <p className="text-3xl font-bold text-success-700">{passedCount}</p>
                <p className="text-xs text-success-600 font-medium mt-1">Réussis</p>
              </div>
              <div className="bg-warning-50 border border-warning-200 rounded-2xl py-5 text-center">
                <p className="text-3xl font-bold text-warning-700">{attempts.length - passedCount}</p>
                <p className="text-xs text-warning-600 font-medium mt-1">En échec</p>
              </div>
            </div>

            <ul className="space-y-3">
              {attempts.map((a) => (
                <li
                  key={a.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 animate-fade-in"
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      a.passed ? 'bg-success-50' : 'bg-error-50'
                    }`}
                  >
                    {a.passed ? (
                      <CheckCircle2 className="w-6 h-6 text-success-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-error-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {a.series_title ?? 'Série inconnue'}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {new Date(a.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className={`text-2xl font-bold ${a.passed ? 'text-success-600' : 'text-error-600'}`}>
                        {a.score}
                        <span className="text-base text-slate-400 font-semibold">/{a.total_questions}</span>
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        a.passed ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-600'
                      }`}
                    >
                      {a.passed ? 'Réussi' : 'Échec'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}