import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  Plus,
  Users,
  Trash2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  History,
  LogOut,
  ArrowLeft,
  X,
  BarChart3,
} from 'lucide-react';
import { api } from '@/lib/db';
import { useAuth } from '@/context/AuthContext';
import type { ExamAttempt, Student } from '@/types';
import StudentFormModal from '@/components/admin/StudentFormModal';

type StudentWithCount = Student & { attemptCount: number };

export default function AdminStudents() {
  const { signOut } = useAuth();
  const [students, setStudents] = useState<StudentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [resetStudent, setResetStudent] = useState<Student | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);
  const [attemptsStudent, setAttemptsStudent] = useState<Student | null>(null);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function loadStudents() {
    setLoading(true);
    const res = await api.get<Student[]>('/students');
    if (res.error) {
      setError('Unable to load students.');
      setLoading(false);
      return;
    }
    const withCounts = res.data.map((s) => ({
      ...s,
      is_active: !!s.is_active,
      attemptCount: s.attempt_count ?? 0,
    }));
    setStudents(withCounts);
    setLoading(false);
  }

  useEffect(() => {
    loadStudents();
  }, []);

  async function handleDelete() {
    if (!deleteConfirm) return;
    const res = await api.del(`/students/${deleteConfirm.id}`);
    if (res.error) {
      setError('Failed to delete student.');
    } else {
      setDeleteConfirm(null);
      loadStudents();
    }
  }

  async function handleResetCode() {
    if (!resetStudent) return;
    const res = await api.post<Student>(`/students/${resetStudent.id}/reset-code`, {});
    if (res.error) {
      setError('Failed to reset access code.');
      return;
    }
    setStudents((prev) =>
      prev.map((s) => (s.id === res.data.id ? { ...s, ...res.data } : s))
    );
    setResetStudent(res.data);
  }

  async function openAttempts(student: Student) {
    setAttemptsStudent(student);
    setAttemptsLoading(true);
    setAttempts([]);
    const res = await api.get<ExamAttempt[]>(`/students/${student.id}/attempts`);
    setAttemptsLoading(false);
    if (res.error) {
      setError('Failed to load results.');
      return;
    }
    setAttempts(res.data);
  }

  async function handleCopy(student: Student) {
    try {
      await navigator.clipboard.writeText(student.access_code);
      setCopiedId(student.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Copy failed — select the code manually.');
    }
  }

  const isLoading = loading;
  const isEmpty = !loading && students.length === 0;

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
              <h1 className="text-lg font-bold text-slate-900">Students</h1>
              <p className="text-xs text-slate-500">Manage client access</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/dashboard"
              className="text-sm text-slate-600 hover:text-primary-600 px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Series</span>
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
        {/* Section header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Student Management</h2>
            <p className="text-slate-500 text-sm mt-1">
              Create student accounts and share the email + access code with your clients.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">New Student</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        )}

        {isEmpty && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No students yet.</p>
            <p className="text-slate-400 text-sm mt-1">Click "New Student" to create your first one.</p>
          </div>
        )}

        {!loading && students.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {students.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{s.name ?? '—'}</h3>
                      <p className="text-sm text-slate-500 truncate">{s.email}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.is_active
                        ? 'bg-success-50 text-success-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3">
                  <code className="flex-1 font-mono text-sm font-bold tracking-wider text-slate-800">
                    {s.access_code}
                  </code>
                  <button
                    onClick={() => handleCopy(s)}
                    className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Copy code"
                  >
                    {copiedId === s.id ? (
                      <Check className="w-4 h-4 text-success-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
                  <BarChart3 className="w-4 h-4" />
                  {s.attemptCount} exams
                  <span className="ml-auto">Créé le {new Date(s.created_at).toLocaleDateString('fr-FR')}</span>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => openAttempts(s)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    <History className="w-4 h-4" />
                    Results
                  </button>
                  <button
                    onClick={() => {
                      setResetStudent(s);
                      setError(null);
                    }}
                    className="p-2 text-slate-500 hover:text-warning-600 hover:bg-warning-50 rounded-lg transition-colors"
                    title="Reset access code"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(s)}
                    className="p-2 text-slate-500 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                    title="Delete student"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New student modal */}
      {showForm && (
        <StudentFormModal
          onClose={() => setShowForm(false)}
          onCreated={() => loadStudents()}
        />
      )}

      {/* Reset code modal */}
      {resetStudent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-warning-50 rounded-xl flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-warning-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Reset access code?</h3>
                <p className="text-sm text-slate-500">{resetStudent.email}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              The old code will stop working. Share the new one with the student.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setResetStudent(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetCode}
                className="flex-1 px-4 py-2.5 bg-warning-500 hover:bg-warning-600 text-white rounded-xl font-medium transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attempts modal */}
      {attemptsStudent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Exam history</h3>
                <p className="text-sm text-slate-500">{attemptsStudent.email}</p>
              </div>
              <button
                onClick={() => setAttemptsStudent(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {attemptsLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-7 h-7 text-primary-500 animate-spin" />
                </div>
              )}
              {!attemptsLoading && attempts.length === 0 && (
                <p className="text-center text-slate-400 py-10">No exams taken yet.</p>
              )}
              {!attemptsLoading && attempts.length > 0 && (
                <ul className="space-y-3">
                  {attempts.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {a.series_title ?? 'Série inconnue'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(a.created_at).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span className="font-bold text-slate-900">
                        {a.score}/{a.total_questions}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          a.passed ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-600'
                        }`}
                      >
                        {a.passed ? 'Réussi' : 'Échec'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
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
                <h3 className="font-bold text-slate-900">Delete student?</h3>
                <p className="text-sm text-slate-500">
                  {deleteConfirm.name ?? deleteConfirm.email}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Their access code will stop working and their exam history will be deleted. This
              cannot be undone.
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