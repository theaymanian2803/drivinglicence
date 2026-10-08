import { useState } from 'react';
import { X, Loader2, AlertCircle, Copy, Check, KeyRound } from 'lucide-react';
import { api } from '@/lib/db';
import type { Student } from '@/types';

interface Props {
  onClose: () => void;
  onCreated: (student: Student) => void;
}

export default function StudentFormModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Student | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    setSaving(true);
    setError(null);

    const res = await api.post<Student>('/students', {
      name: name.trim() || null,
      email: email.trim(),
    });

    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    setCreated(res.data);
    onCreated(res.data);
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.access_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — select the code manually.');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">New Student</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {created ? (
          /* Success + access code */
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-success-50 rounded-xl flex items-center justify-center">
                <KeyRound className="w-6 h-6 text-success-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900">Student created!</p>
                <p className="text-sm text-slate-500">
                  Give this access code to {created.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
              <code className="flex-1 text-center font-mono text-xl font-bold tracking-widest text-slate-900">
                {created.access_code}
              </code>
              <button
                onClick={handleCopy}
                className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                title="Copy code"
              >
                {copied ? <Check className="w-5 h-5 text-success-600" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>

            {copied && (
              <p className="text-sm text-success-600 mb-4">Code copied to clipboard.</p>
            )}

            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Create form */
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ahmed Benali"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email <span className="text-error-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}