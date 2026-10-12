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
  ArrowRight,
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
      setError('تعذّر تحميل المترشحين.');
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
      setError('فشل حذف المترشح.');
    } else {
      setDeleteConfirm(null);
      loadStudents();
    }
  }

  async function handleResetCode() {
    if (!resetStudent) return;
    const res = await api.post<Student>(`/students/${resetStudent.id}/reset-code`, {});
    if (res.error) {
      setError('فشل إعادة تعيين رمز الدخول.');
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
      setError('فشل تحميل النتائج.');
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
      setError('فشل النسخ — انسخ الرمز يدوياً.');
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
              <h1 className="text-lg font-bold text-slate-900">المترشحون</h1>
              <p className="text-xs text-slate-500">إدارة وصول المترشحين</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/dashboard"
              className="text-sm text-slate-600 hover:text-primary-600 px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span className="hidden sm:inline">السلاسل</span>
            </Link>
            <button
              onClick={signOut}
              className="text-sm text-slate-600 hover:text-error-600 px-3 py-2 rounded-lg hover:bg-error-50 transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Section header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">إدارة المترشحين</h2>
            <p className="text-slate-500 text-sm mt-1">
              أنشئ حسابات المترشحين وشارك معهم البريد الإلكتروني ورمز الدخول.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">مترشح جديد</span>
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
            <p className="text-slate-500 font-medium">لا يوجد مترشحون بعد.</p>
            <p className="text-slate-400 text-sm mt-1">انقر على "مترشح جديد" لإنشاء أول مترشح.</p>
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
                    {s.is_active ? 'مفعّل' : 'معطّل'}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3">
                  <code className="flex-1 font-mono text-sm font-bold tracking-wider text-slate-800">
                    {s.access_code}
                  </code>
                  <button
                    onClick={() => handleCopy(s)}
                    className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="نسخ الرمز"
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
                  {s.attemptCount} امتحان
                  <span className="ms-auto">أُضيف في {new Date(s.created_at).toLocaleDateString('ar-MA')}</span>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => openAttempts(s)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    <History className="w-4 h-4" />
                    النتائج
                  </button>
                  <button
                    onClick={() => {
                      setResetStudent(s);
                      setError(null);
                    }}
                    className="p-2 text-slate-500 hover:text-warning-600 hover:bg-warning-50 rounded-lg transition-colors"
                    title="إعادة تعيين رمز الدخول"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(s)}
                    className="p-2 text-slate-500 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                    title="حذف المترشح"
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
                <h3 className="font-bold text-slate-900">إعادة تعيين رمز الدخول؟</h3>
                <p className="text-sm text-slate-500">{resetStudent.email}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              سيتوقف الرمز القديم عن العمل. شارك الرمز الجديد مع المترشح.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setResetStudent(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleResetCode}
                className="flex-1 px-4 py-2.5 bg-warning-500 hover:bg-warning-600 text-white rounded-xl font-medium transition-colors"
              >
                إعادة التعيين
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
                <h3 className="font-bold text-slate-900">سجل الامتحانات</h3>
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
                <p className="text-center text-slate-400 py-10">لم يُخضع أي امتحان بعد.</p>
              )}
              {!attemptsLoading && attempts.length > 0 && (
                <ul className="space-y-3">
                  {attempts.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {a.series_title ?? 'سلسلة غير معروفة'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(a.created_at).toLocaleDateString('ar-MA', {
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
                        {a.passed ? 'ناجح' : 'راسب'}
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
                <h3 className="font-bold text-slate-900">حذف المترشح؟</h3>
                <p className="text-sm text-slate-500">
                  {deleteConfirm.name ?? deleteConfirm.email}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              سيتوقف رمز الدخول عن العمل وسيُحذف سجل امتحاناته. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 bg-error-600 hover:bg-error-700 text-white rounded-xl font-medium transition-colors"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}