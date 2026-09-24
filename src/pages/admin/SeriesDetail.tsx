import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Image as ImageIcon,
  Clock,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/db';
import type { Question, Series } from '@/types';
import QuestionFormModal from '@/components/admin/QuestionFormModal';

export default function SeriesDetail() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Question | null>(null);

  async function loadData() {
    if (!seriesId) return;
    setLoading(true);
    const [seriesRes, questionsRes] = await Promise.all([
      api.get<Series>(`/series/${seriesId}`),
      api.get<Question[]>(`/series/${seriesId}/questions`),
    ]);
    if (seriesRes.error || questionsRes.error || !seriesRes.data) {
      setError('Unable to load series details.');
      setLoading(false);
      return;
    }
    setSeries({ ...seriesRes.data, is_active: !!seriesRes.data.is_active });
    setQuestions(questionsRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId]);

  async function handleDelete() {
    if (!deleteConfirm) return;
    const res = await api.del(`/questions/${deleteConfirm.id}`);
    if (res.error) {
      setError('Failed to delete question.');
    } else {
      setDeleteConfirm(null);
      loadData();
    }
  }

  async function moveQuestion(q: Question, direction: 'up' | 'down') {
    const idx = questions.findIndex((item) => item.id === q.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= questions.length) return;
    const reordered = [...questions];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const res = await api.patch('/questions/reorder', { ids: reordered.map((item) => item.id) });
    if (res.error) {
      setError('Failed to reorder questions.');
      return;
    }
    loadData();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/dashboard"
              className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{series?.title ?? 'Series'}</h1>
              <p className="text-xs text-slate-500">
                {questions.length} question{questions.length !== 1 ? 's' : ''} · {series?.category}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingQuestion(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Add Question</span>
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

        {!loading && questions.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No questions yet.</p>
            <p className="text-slate-400 text-sm mt-1">
              Click "Add Question" to create your first question.
            </p>
          </div>
        )}

        {!loading && questions.length > 0 && (
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Number + image */}
                  <div className="flex-shrink-0">
                    {q.image_url ? (
                      <img
                        src={q.image_url}
                        alt="Question"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-400">
                        Q{idx + 1}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        {q.timer_duration}s
                      </span>
                      <span className="text-xs px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded font-medium">
                        {q.category}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 font-medium line-clamp-2 mb-2">
                      {q.question_text}
                    </p>
                    {q.question_text_2 && (
                      <p className="text-xs text-slate-500 line-clamp-1 mb-2 italic">
                        {q.question_text_2}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>Correct: {q.correct_answers.join(', ')}</span>
                      {q.audio_url && (
                        <span className="flex items-center gap-1 text-success-600">
                          <CheckCircle2 className="w-3 h-3" />
                          Audio
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveQuestion(q, 'up')}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveQuestion(q, 'down')}
                      disabled={idx === questions.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0 border-l border-slate-100 pl-2">
                    <button
                      onClick={() => {
                        setEditingQuestion(q);
                        setShowForm(true);
                      }}
                      className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(q)}
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

      {showForm && series && (
        <QuestionFormModal
          seriesId={series.id}
          question={editingQuestion}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadData();
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
              <h3 className="font-bold text-slate-900">Delete question?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              This question will be permanently removed from this series.
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
