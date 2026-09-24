import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, Image as ImageIcon, Music, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Question } from '@/types';

interface Props {
  seriesId: string;
  question: Question | null;
  onClose: () => void;
  onSaved: () => void;
}

const TIMER_OPTIONS: { value: 10 | 20 | 30; label: string }[] = [
  { value: 10, label: '10 seconds' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
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
      label: questionText2.trim() ? 'Question 1 — Options 1 & 2' : 'Answer Options',
      options: [
        { num: 1, value: option1, set: setOption1 },
        { num: 2, value: option2, set: setOption2 },
      ],
    },
    {
      label: questionText2.trim() ? 'Question 2 — Options 3 & 4' : 'Options 3 & 4 (optional)',
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
      setError('Question text is required.');
      return;
    }
    if (!option1.trim() || !option2.trim()) {
      setError('At least options 1 and 2 are required.');
      return;
    }
    if (correctAnswers.length === 0) {
      setError('Select at least one correct answer.');
      return;
    }
    if (correctAnswers.length > 2) {
      setError('Maximum 2 correct answers allowed.');
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
        setError(`Option ${num} is marked correct but is empty.`);
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

    let err;
    if (question) {
      const res = await supabase.from('questions').update(payload).eq('id', question.id);
      err = res.error;
    } else {
      const res = await supabase.from('questions').insert(payload);
      err = res.error;
    }

    if (err) {
      setError(err.message);
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
            {question ? 'Edit Question' : 'Add Question'}
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

          {/* Image URL */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
              <ImageIcon className="w-4 h-4 text-slate-400" />
              Scenario Image URL
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/scenario.jpg"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Preview"
                className="mt-2 w-full h-32 object-cover rounded-lg border border-slate-200"
              />
            )}
          </div>

          {/* Audio URL */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
              <Music className="w-4 h-4 text-slate-400" />
              Question Audio URL (optional)
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
              Question Text 1 <span className="text-error-500">*</span>
              <span className="text-slate-400 font-normal text-xs ml-2">
                For options 1 &amp; 2 (supports Arabic and French)
              </span>
            </label>
            <textarea
              required
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={2}
              placeholder="Enter the first question..."
              dir="auto"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Second Question Text (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Question Text 2
              <span className="text-slate-400 font-normal text-xs ml-2">
                Optional — for options 3 &amp; 4 when the question has two sub-questions
              </span>
            </label>
            <textarea
              value={questionText2}
              onChange={(e) => setQuestionText2(e.target.value)}
              rows={2}
              placeholder="Enter a second question if options 3 & 4 have a different prompt..."
              dir="auto"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Options grouped */}
          {optionGroups.map((group, gi) => (
            <div key={gi}>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {group.label}
                <span className="text-slate-400 font-normal text-xs ml-2">
                  Check the box for correct answer(s)
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
                      placeholder={`Option ${opt.num}${opt.num <= 2 ? ' *' : ''}`}
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
                Timer Duration
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
                License Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    Category {c}
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : question ? 'Save' : 'Add Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
