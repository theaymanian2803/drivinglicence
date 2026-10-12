import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, Music, Check } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import { api } from '@/lib/db';
import type { Question } from '@/types';

interface Props {
  seriesId: string;
  question: Question | null;
  onClose: () => void;
  onSaved: () => void;
}

const TIMER_OPTIONS: { value: 10 | 20 | 30; label: string }[] = [
  { value: 10, label: '10 ثوانٍ' },
  { value: 20, label: '20 ثانية' },
  { value: 30, label: '30 ثانية' },
];

const CATEGORIES = ['A', 'B', 'C', 'D', 'E'];

export default function QuestionFormModal({ seriesId, question, onClose, onSaved }: Props) {
  const [imageUrl, setImageUrl] = useState(question?.image_url ?? '');
  const [audioUrl, setAudioUrl] = useState(question?.audio_url ?? '');
  const [questionText, setQuestionText] = useState(question?.question_text ?? '');
  const [questionText2, setQuestionText2] = useState(question?.question_text_2 ?? '');
  const [option1, setOption1] = useState(question?.option_1 ?? '');
  const [option2, setOption2] = useState(question?.option_2 ?? '');
  const [option3, setOption3] = useState(question?.option_3 ?? '');
  const [option4, setOption4] = useState(question?.option_4 ?? '');
  const [correctAnswers, setCorrectAnswers] = useState<number[]>(question?.correct_answers ?? []);
  const [timerDuration, setTimerDuration] = useState<10 | 20 | 30>(question?.timer_duration ?? 20);
  const [category, setCategory] = useState(question?.category ?? 'B');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (question) {
      setImageUrl(question.image_url ?? '');
      setAudioUrl(question.audio_url ?? '');
      setQuestionText(question.question_text);
      setQuestionText2(question.question_text_2 ?? '');
      setOption1(question.option_1);
      setOption2(question.option_2);
      setOption3(question.option_3 ?? '');
      setOption4(question.option_4 ?? '');
      setCorrectAnswers(question.correct_answers);
      setTimerDuration(question.timer_duration);
      setCategory(question.category);
    }
  }, [question]);

  const toggleCorrect = (num: number) => {
    setCorrectAnswers((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort()
    );
  };

  const optionGroups = [
    {
      label: questionText2.trim() ? 'السؤال 1 — الخياران 1 و2' : 'خيارات الإجابة',
      options: [
        { num: 1, value: option1, set: setOption1 },
        { num: 2, value: option2, set: setOption2 },
      ],
    },
    {
      label: questionText2.trim() ? 'السؤال 2 — الخياران 3 و4' : 'الخياران 3 و4 (اختياري)',
      options: [
        { num: 3, value: option3, set: setOption3 },
        { num: 4, value: option4, set: setOption4 },
      ],
    },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!questionText.trim()) {
      setError('نص السؤال مطلوب.');
      return;
    }
    if (!option1.trim() || !option2.trim()) {
      setError('الخياران 1 و2 مطلوبان على الأقل.');
      return;
    }
    if (correctAnswers.length === 0) {
      setError('اختر إجابة صحيحة واحدة على الأقل.');
      return;
    }
    if (correctAnswers.length > 2) {
      setError('يُسمح بإجابتين صحيحتين كحد أقصى.');
      return;
    }
    const allOptions = [
      { num: 1, value: option1 },
      { num: 2, value: option2 },
      { num: 3, value: option3 },
      { num: 4, value: option4 },
    ];
    for (const num of correctAnswers) {
      const opt = allOptions.find((o) => o.num === num);
      if (opt && !opt.value.trim()) {
        setError(`الخيار ${num} محدَّد كصحيح لكنه فارغ.`);
        return;
      }
    }

    setSaving(true);

    const payload = {
      series_id: seriesId,
      image_url: imageUrl.trim() || null,
      audio_url: audioUrl.trim() || null,
      question_text: questionText.trim(),
      question_text_2: questionText2.trim() || null,
      option_1: option1.trim(),
      option_2: option2.trim(),
      option_3: option3.trim() || null,
      option_4: option4.trim() || null,
      correct_answers: correctAnswers,
      timer_duration: timerDuration,
      category,
    };

    let res;
    if (question) {
      res = await api.put<Question>(`/questions/${question.id}`, payload);
    } else {
      res = await api.post<Question>('/questions', payload);
    }
    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">
            {question ? 'تعديل السؤال' : 'إضافة سؤال'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Scenario Image */}
          <ImageUpload
            value={imageUrl}
            onChange={setImageUrl}
            label="صورة الوضعية"
          />

          {/* Audio URL */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
              <Music className="w-4 h-4 text-slate-400" />
              رابط صوت السؤال (اختياري)
            </label>
            <input
              type="url"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://example.com/question.mp3"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Primary Question Text */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              نص السؤال 1 <span className="text-error-500">*</span>
              <span className="text-slate-400 font-normal text-xs ms-2">
                للخيارين 1 و2 (يدعم العربية والفرنسية)
              </span>
            </label>
            <textarea
              required
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={2}
              placeholder="أدخل السؤال الأول..."
              dir="auto"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Second Question Text (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              نص السؤال 2
              <span className="text-slate-400 font-normal text-xs ms-2">
                اختياري — للخيارين 3 و4 عندما يتضمن السؤال سؤالين فرعيين
              </span>
            </label>
            <textarea
              value={questionText2}
              onChange={(e) => setQuestionText2(e.target.value)}
              rows={2}
              placeholder="أدخل سؤالاً ثانياً إذا كان للخيارين 3 و4 نص مختلف..."
              dir="auto"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Options grouped */}
          {optionGroups.map((group, gi) => (
            <div key={gi}>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {group.label}
                <span className="text-slate-400 font-normal text-xs ms-2">
                  حدِّد المربع للإجابة/الإجابات الصحيحة
                </span>
              </label>
              <div className="space-y-2.5">
                {group.options.map((opt) => (
                  <div key={opt.num} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleCorrect(opt.num)}
                      className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm transition-all border-2 ${
                        correctAnswers.includes(opt.num)
                          ? 'bg-success-500 border-success-500 text-white'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {correctAnswers.includes(opt.num) ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        opt.num
                      )}
                    </button>
                    <input
                      type="text"
                      value={opt.value}
                      onChange={(e) => opt.set(e.target.value)}
                      placeholder={`الخيار ${opt.num}${opt.num <= 2 ? ' *' : ''}`}
                      dir="auto"
                      className={`flex-1 px-4 py-2.5 bg-slate-50 border rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all ${
                        correctAnswers.includes(opt.num)
                          ? 'border-success-200 bg-success-50/30'
                          : 'border-slate-200'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Timer + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                مدة المؤقّت
              </label>
              <select
                value={timerDuration}
                onChange={(e) => setTimerDuration(parseInt(e.target.value) as 10 | 20 | 30)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              >
                {TIMER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                فئة الرخصة
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    الفئة {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 sticky bottom-0 bg-white -mx-6 px-6 py-4 border-t border-slate-100 -mb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : question ? 'حفظ' : 'إضافة سؤال'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
