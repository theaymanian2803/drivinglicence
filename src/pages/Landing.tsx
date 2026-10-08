import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  ChevronRight,
  Clock,
  FileQuestion,
  Loader2,
  Lock,
  Signpost,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/db';
import SiteHeader from '@/components/SiteHeader';
import type { SeriesWithCount } from '@/types';

export default function Landing() {
  const [series, setSeries] = useState<SeriesWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SeriesWithCount[]>('/series').then((res) => {
      if (!res.error) setSeries(res.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <SiteHeader title="Code de la Route" subtitle="Catégorie B — Maroc" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero */}
        <section className="text-center mb-12 animate-fade-in">
          <div className="inline-flex w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl items-center justify-center shadow-xl mb-5">
            <Car className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4">
            Prépare le Code de la Route
          </h1>
          <p className="text-slate-500 max-w-2xl mx-auto text-lg">
            Entraîne-toi avec des séries d'examens chronométrées et apprends la
            signification de chaque panneau de signalisation.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signs"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold shadow-md transition-colors"
            >
              <Signpost className="w-5 h-5" />
              Explorer les panneaux
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 hover:border-primary-300 text-slate-700 rounded-xl font-semibold shadow-sm transition-colors"
            >
              <Sparkles className="w-5 h-5 text-primary-600" />
              Espace élève
            </Link>
          </div>
        </section>

        {/* Series */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Séries d'examen</h2>
            <Link
              to="/login"
              className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
            >
              Se connecter <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          )}

          {!loading && series.length === 0 && (
            <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="text-slate-500 font-medium">Aucune série disponible pour le moment.</p>
            </div>
          )}

          {!loading && series.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {series.map((s) => (
                <div
                  key={s.id}
                  className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-primary-300 hover:shadow-xl transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                      <FileQuestion className="w-7 h-7 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full">
                      {s.category}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{s.title}</h3>
                  {s.description && (
                    <p className="text-sm text-slate-500 mb-4 line-clamp-2">{s.description}</p>
                  )}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <FileQuestion className="w-4 h-4" />
                        {s.question_count} questions
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        ~{Math.ceil((s.question_count * 20) / 60)} min
                      </span>
                    </div>
                    <Lock className="w-5 h-5 text-slate-300" />
                  </div>
                  <Link
                    to="/login"
                    className="mt-4 block text-center px-4 py-2.5 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl text-sm font-semibold transition-colors"
                  >
                    Se connecter pour passer l'examen
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
