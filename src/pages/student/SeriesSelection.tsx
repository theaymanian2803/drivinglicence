import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, ChevronRight, Clock, FileQuestion, Loader2 } from 'lucide-react';
import { api } from '@/lib/db';
import type { SeriesWithCount } from '@/types';

export default function SeriesSelection() {
  const [series, setSeries] = useState<SeriesWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-primary-600 rounded-xl flex items-center justify-center shadow-md">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Code de la Route</h1>
              <p className="text-sm text-slate-500">Catégorie B — Maroc</p>
            </div>
          </div>
          <Link
            to="/admin"
            className="text-sm font-medium text-slate-600 hover:text-primary-600 transition-colors px-4 py-2 rounded-lg hover:bg-primary-50"
          >
            Admin
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Choisissez une série</h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Sélectionnez une série d'examens pour commencer votre test. Chaque série contient des
            questions avec un chronomètre et des scénarios routiers.
          </p>
        </div>

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
              return (
                <Link
                  key={s.id}
                  to={`/exam/${s.id}`}
                  className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-primary-300 hover:shadow-xl transition-all duration-300 animate-fade-in"
                >
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
                        {questionCount} questions
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        ~{Math.ceil((questionCount * 20) / 60)} min
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
