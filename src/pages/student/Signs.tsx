import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, CreditCard, Image as ImageIcon, Loader2, Signpost } from 'lucide-react';
import { api } from '@/lib/db';
import SiteHeader from '@/components/SiteHeader';
import { SIGN_CATEGORIES } from '@/types';
import type { TrafficSign } from '@/types';

export default function Signs() {
  const [signs, setSigns] = useState<TrafficSign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<TrafficSign[]>('/signs').then((res) => {
      if (res.error) {
        setError('Impossible de charger les panneaux. Réessaie plus tard.');
      } else {
        setSigns(res.data);
      }
      setLoading(false);
    });
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, TrafficSign[]>();
    for (const c of SIGN_CATEGORIES) map.set(c, []);
    for (const s of signs) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [signs]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <SiteHeader title="Les panneaux" subtitle="Signification des panneaux de signalisation" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md">
            <Signpost className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Panneaux de signalisation</h1>
            <p className="text-sm text-slate-500">
              Clique sur un panneau pour voir sa signification
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-slate-400 mt-3">Chargement...</p>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto bg-error-50 border border-error-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-error-500 mx-auto mb-2" />
            <p className="text-error-700 font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && signs.length === 0 && (
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-10 text-center">
            <Signpost className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Aucun panneau disponible pour le moment.</p>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="space-y-8">
            {groups.map(([category, list]) => (
              <section key={category} className="animate-fade-in">
                <h2 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">
                  {category}
                  <span className="ml-2 text-sm font-medium text-slate-400">
                    {list.length} panneau{list.length > 1 ? 'x' : ''}
                  </span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {list.map((s) => {
                    const isOpen = expanded.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggle(s.id)}
                        className={`text-left bg-white rounded-2xl border p-4 transition-all duration-200 ${
                          isOpen
                            ? 'border-primary-300 shadow-lg col-span-2 sm:col-span-3 lg:col-span-4'
                            : 'border-slate-200 hover:border-primary-300 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {s.image_url ? (
                            <img
                              src={s.image_url}
                              alt={s.title}
                              className="w-14 h-14 rounded-xl object-contain bg-slate-50 border border-slate-100"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
                              <ImageIcon className="w-6 h-6 text-slate-300" />
                            </div>
                          )}
                          <span className="flex-1 font-semibold text-slate-800 text-sm leading-snug">
                            {s.title}
                          </span>
                          <ChevronDown
                            className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </div>

                        {isOpen && (
                          <div className="mt-4 pt-4 border-t border-slate-100">
                            <p className="text-sm text-slate-700 mb-4">{s.description}</p>
                            {s.scenario_image_url && (
                              <figure>
                                <figcaption className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
                                  <CreditCard className="w-4 h-4" />
                                  Exemple en situation
                                </figcaption>
                                <img
                                  src={s.scenario_image_url}
                                  alt={`Situation ${s.title}`}
                                  className="rounded-xl border border-slate-200 w-full object-contain bg-slate-50"
                                />
                              </figure>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
