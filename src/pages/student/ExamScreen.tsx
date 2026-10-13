import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trophy,
  Home,
  Loader2,
  Car,
  BookOpen,
} from 'lucide-react';
import { api } from '@/lib/db';
import type { CompleteRevisionResult, OfficialExamStart, Question, RevisionSummary, Series } from '@/types';

type ExamPhase = 'loading' | 'exam' | 'results';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface ExamResult {
  question: Question;
  selected: number[];
  correct: boolean;
  timedOut: boolean;
}

function AnswerReview({ result, index }: { result: ExamResult; index: number }) {
  const options = ([1, 2, 3, 4] as const)
    .map((num) => ({
      num,
      text: result.question[`option_${num}` as keyof Question] as string | null,
    }))
    .filter((o) => o.text);

  return (
    <li
      className={`rounded-xl p-3 border ${
        result.correct ? 'bg-success-50 border-success-200' : 'bg-error-50 border-error-200'
      }`}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {result.correct ? (
            <CheckCircle2 className="w-5 h-5 text-success-600" />
          ) : (
            <XCircle className="w-5 h-5 text-error-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900" dir="auto">
            {index + 1}. {result.question.question_text}
          </p>
          <div className="mt-2 space-y-1">
            {options.map((o) => {
              const isCorrect = result.question.correct_answers.includes(o.num);
              const isSelected = result.selected.includes(o.num);
              return (
                <div
                  key={o.num}
                  className={`flex items-start gap-2 text-sm rounded-lg px-2 py-1 ${
                    isCorrect
                      ? 'bg-success-100/70 text-success-800'
                      : isSelected
                      ? 'bg-error-100/70 text-error-800'
                      : 'text-slate-500'
                  }`}
                >
                  <span className="font-bold flex-shrink-0">{o.num}.</span>
                  <span className="flex-1" dir="auto">
                    {o.text}
                  </span>
                  <span className="flex items-center gap-1 flex-shrink-0 text-xs font-semibold">
                    {isCorrect && (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> صحيحة
                      </>
                    )}
                    {!isCorrect && isSelected && (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> اختيارك
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {result.timedOut && (
            <p className="mt-1.5 text-xs font-semibold text-warning-600">انتهى الوقت</p>
          )}
        </div>
      </div>
    </li>
  );
}

function SaveStatus({
  state,
  error,
  onRetry,
}: {
  state: SaveState;
  error: string | null;
  onRetry: () => void;
}) {
  if (state === 'idle' || state === 'saving') {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-slate-500 mb-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        جارٍ حفظ النتيجة...
      </div>
    );
  }
  if (state === 'saved') {
    return (
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-success-600 mb-6">
        <CheckCircle2 className="w-4 h-4" />
        تم حفظ النتيجة في نتائجك.
      </div>
    );
  }
  return (
    <div className="bg-error-50 border border-error-200 rounded-xl p-3 mb-6 text-center">
      <p className="text-sm text-error-700 font-medium mb-2" dir="auto">
        تعذّر حفظ النتيجة{error ? `: ${error}` : '.'}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-error-600 hover:bg-error-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        إعادة المحاولة
      </button>
    </div>
  );
}

interface ExamScreenProps {
  revisionMode?: boolean;
  officialMode?: boolean;
}

export default function ExamScreen({ revisionMode = false, officialMode = false }: ExamScreenProps) {
  const { seriesId } = useParams<{ seriesId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const homePath = revisionMode ? '/revision' : '/';

  const [phase, setPhase] = useState<ExamPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(20);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.7);
  const [revisionSummary, setRevisionSummary] = useState<RevisionSummary | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancingRef = useRef(false);
  const submittedRef = useRef(false);

  const currentQuestion = questions[currentIndex];

  // ===== Persist the session result (awaited, with visible failure state) =====
  const submitResults = useCallback(async () => {
    if (results.length === 0) return;
    const score = results.filter((r) => r.correct).length;
    setSaveState('saving');
    setSaveError(null);

    if (revisionMode) {
      const res = await api.post<CompleteRevisionResult>('/revision/complete', {
        results: results.map((r) => ({
          question_id: r.question.id,
          correct: r.correct,
        })),
      });
      if (res.error) {
        setSaveError(res.error.message);
        setSaveState('error');
        return;
      }
      setRevisionSummary(res.data.summary);
      setSaveState('saved');
      return;
    }

    if (officialMode) {
      const res = await api.post('/exams/official/complete', {
        score,
        total_questions: questions.length,
        wrong_question_ids: results.filter((r) => !r.correct).map((r) => r.question.id),
      });
      if (res.error) {
        setSaveError(res.error.message);
        setSaveState('error');
        return;
      }
      setSaveState('saved');
      return;
    }

    if (!series?.id) {
      setSaveState('saved');
      return;
    }
    const res = await api.post('/attempts', {
      series_id: series.id,
      score,
      total_questions: questions.length,
      wrong_question_ids: results.filter((r) => !r.correct).map((r) => r.question.id),
    });
    if (res.error) {
      setSaveError(res.error.message);
      setSaveState('error');
      return;
    }
    setSaveState('saved');
  }, [results, revisionMode, officialMode, series?.id, questions.length]);

  useEffect(() => {
    if (phase !== 'results' || submittedRef.current) return;
    if (results.length === 0) return;
    submittedRef.current = true;
    void submitResults();
  }, [phase, results.length, submitResults]);

  // ===== Load data (normal mode fetches the series; revision uses passed questions) =====
  useEffect(() => {
    async function loadData() {
      if (revisionMode) {
        const state = location.state as { questions?: Question[] } | null;
        const qData = state?.questions;
        if (!qData || qData.length === 0) {
          navigate('/revision', { replace: true });
          return;
        }
        setSeries({
          id: 'revision',
          title: 'أخطائي',
          description: 'مراجعة الأسئلة التي أخطأت فيها سابقاً',
          is_active: true,
          category: 'المراجعة',
          pass_score: 1,
          required_questions: 0,
          created_at: '',
          updated_at: '',
        });
        setQuestions(qData);
        setTimeLeft(qData[0].timer_duration);
        setPhase('exam');
        return;
      }

      if (officialMode) {
        const res = await api.get<OfficialExamStart>('/exams/official');
        if (res.error) {
          setError(res.error.message || 'تعذّر تحميل الامتحان الرسمي.');
          setPhase('exam');
          return;
        }
        const data = res.data;
        setSeries({
          id: 'official',
          title: 'الامتحان الرسمي',
          description: data.question_count + ' سؤال من كامل البنك',
          is_active: true,
          category: 'رسمي',
          pass_score: data.pass_score,
          required_questions: data.question_count,
          created_at: '',
          updated_at: '',
        });
        const qData = data.questions.map((q) => ({
          ...q,
          timer_duration: data.timer_duration as Question['timer_duration'],
        }));
        setQuestions(qData);
        setTimeLeft(data.timer_duration);
        setPhase('exam');
        return;
      }

      if (!seriesId) return;
      const [seriesRes, questionsRes] = await Promise.all([
        api.get<Series>(`/series/${seriesId}`),
        api.get<Question[]>(`/series/${seriesId}/questions`),
      ]);
      if (seriesRes.error || questionsRes.error) {
        setError('تعذّر تحميل بيانات الامتحان.');
        setPhase('exam');
        return;
      }
      if (!seriesRes.data) {
        setError('السلسلة غير موجودة.');
        setPhase('exam');
        return;
      }
      const qData = questionsRes.data;
      if (!qData || qData.length === 0) {
        setError('لا تحتوي هذه السلسلة على أسئلة بعد.');
        setPhase('exam');
        return;
      }
      setSeries({ ...seriesRes.data, is_active: !!seriesRes.data.is_active });
      setQuestions(qData);
      setTimeLeft(qData[0].timer_duration);
      setPhase('exam');
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionMode, officialMode, seriesId]);

  // ===== Stop audio =====
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  // ===== Advance to next question or results =====
  const goToNext = useCallback(() => {
    setSelectedAnswers([]);

    setCurrentIndex((prevIdx) => {
      const nextIdx = prevIdx + 1;
      if (nextIdx >= questions.length) {
        setPhase('results');
        return prevIdx;
      }
      setTimeLeft(questions[nextIdx].timer_duration);
      return nextIdx;
    });
  }, [questions]);

  // ===== Record result and move on (no per-question correction) =====
  const recordAndAdvance = useCallback(
    (isCorrect: boolean, selected: number[], timedOut: boolean) => {
      if (advancingRef.current) return;
      advancingRef.current = true;

      if (timerRef.current) clearInterval(timerRef.current);
      stopAudio();

      setResults((prev) => [
        ...prev,
        { question: currentQuestion, selected, correct: isCorrect, timedOut },
      ]);
      goToNext();
    },
    [currentQuestion, goToNext, stopAudio]
  );

  // ===== Unlock interaction once the next question is shown =====
  useEffect(() => {
    advancingRef.current = false;
  }, [currentIndex]);

  // ===== Timer — clean interval, no side effects inside setter =====
  useEffect(() => {
    if (phase !== 'exam') return;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, phase]);

  // ===== Handle time reaching zero =====
  useEffect(() => {
    if (phase !== 'exam') return;
    if (timeLeft > 0) return;
    if (advancingRef.current) return;

    recordAndAdvance(false, [], true);
  }, [timeLeft, phase, recordAndAdvance]);

  // ===== Audio playback =====
  useEffect(() => {
    if (phase !== 'exam' || !currentQuestion?.audio_url) return;
    stopAudio();
    audioRef.current = new Audio(currentQuestion.audio_url);
    audioRef.current.volume = audioMuted ? 0 : audioVolume;
    audioRef.current.play().catch(() => {});
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, phase]);

  // ===== Volume changes =====
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioMuted ? 0 : audioVolume;
    }
  }, [audioMuted, audioVolume]);

  // ===== Cleanup on unmount =====
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAudio();
    };
  }, [stopAudio]);

  // ===== Answer toggling =====
  const toggleAnswer = (num: number) => {
    if (advancingRef.current) return;
    setSelectedAnswers((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort()
    );
  };

  // ===== Corriger (clear selections) =====
  const handleCorriger = () => {
    if (advancingRef.current) return;
    setSelectedAnswers([]);
  };

  // ===== Valider (submit answer) =====
  const handleValider = () => {
    if (advancingRef.current || !currentQuestion || selectedAnswers.length === 0) return;

    const sortedSelected = [...selectedAnswers].sort();
    const sortedCorrect = [...currentQuestion.correct_answers].sort();
    const isCorrect =
      sortedSelected.length === sortedCorrect.length &&
      sortedSelected.every((v, i) => v === sortedCorrect[i]);

    recordAndAdvance(isCorrect, sortedSelected, false);
  };

  // ===== Keyboard support =====
  useEffect(() => {
    if (phase !== 'exam') return;
    const handler = (e: KeyboardEvent) => {
      if (advancingRef.current) return;
      if (['1', '2', '3', '4'].includes(e.key)) {
        const num = parseInt(e.key);
        const optKey = `option_${num}` as keyof Question;
        if (currentQuestion?.[optKey]) {
          toggleAnswer(num);
        }
      }
      if (e.key === 'Enter') {
        handleValider();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedAnswers, currentQuestion, currentIndex]);

  const score = results.filter((r) => r.correct).length;
  const totalQuestions = questions.length;
  const answeredCount = results.length;
  const passScore = series?.pass_score ?? 32;

  // ===== LOADING =====
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
        <p className="text-slate-400 mt-4">جارٍ تحميل الامتحان...</p>
      </div>
    );
  }

  // ===== ERROR =====
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
        <AlertCircle className="w-12 h-12 text-error-400 mb-4" />
        <p className="text-white text-lg font-medium mb-2">{error}</p>
        <button
          onClick={() => navigate(homePath)}
          className="mt-4 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
        >
          العودة إلى الصفحة الرئيسية
        </button>
      </div>
    );
  }

  // ===== RESULTS =====
  if (phase === 'results') {
    const passed = score >= passScore;
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    if (revisionMode) {
      const remaining = revisionSummary?.to_review.length ?? null;
      const mastered = revisionSummary?.corrected.length ?? null;
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-10 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden animate-slide-up">
              <div className="px-8 py-8 text-center bg-gradient-to-br from-indigo-500 to-primary-700">
                <div className="inline-flex w-20 h-20 bg-white/20 backdrop-blur rounded-full items-center justify-center mb-4">
                  <BookOpen className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-1">انتهت المراجعة</h2>
                <p className="text-white/80 text-lg">
                  {score} إجابة صحيحة من {totalQuestions}
                </p>
              </div>

              <div className="px-8 py-6">
                <SaveStatus state={saveState} error={saveError} onRetry={() => void submitResults()} />

                <ul className="space-y-3 mb-6">
                  {results.map((r, idx) => (
                    <AnswerReview key={r.question.id} result={r} index={idx} />
                  ))}
                </ul>

                {revisionSummary && (
                  <div className="text-center text-sm text-slate-600 mb-6">
                    {remaining} سؤال للمراجعة
                    {mastered !== null ? ` · ${mastered} متقنة` : ''}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => navigate('/revision')}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                  >
                    <BookOpen className="w-5 h-5" />
                    أخطائي
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
                  >
                    <RotateCcw className="w-5 h-5" />
                    إعادة المحاولة
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center px-4 py-10">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden animate-slide-up">
            <div
              className={`px-8 py-10 text-center ${
                passed
                  ? 'bg-gradient-to-br from-success-500 to-success-700'
                  : 'bg-gradient-to-br from-error-500 to-error-700'
              }`}
            >
              <div className="inline-flex w-20 h-20 bg-white/20 backdrop-blur rounded-full items-center justify-center mb-4">
                <Trophy className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">
                {passed ? 'تهانينا!' : 'عذراً'}
              </h2>
              <p className="text-white/80 text-lg">
                {passed ? 'لقد نجحت في الاختبار.' : 'لم تصل إلى العلامة المطلوبة.'}
              </p>
            </div>

            <div className="px-8 py-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-6">
                <span className="text-6xl font-bold text-slate-900">{score}</span>
                <span className="text-3xl text-slate-400 font-light">/ {totalQuestions}</span>
              </div>

              <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    passed ? 'bg-success-500' : 'bg-error-500'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-sm text-slate-500 mb-2">
                {percentage}% — العلامة الدنيا: {passScore}/{totalQuestions}
              </p>
              <p className={`text-sm font-medium mb-6 ${passed ? 'text-success-600' : 'text-error-600'}`}>
                {passed
                  ? `تم تجاوز العتبة — ${score - passScore} إجابة فوق الحد الأدنى.`
                  : `يتبقى ${passScore - score} إجابة صحيحة للنجاح.`}
              </p>

              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-success-50 border border-success-200 rounded-xl py-4">
                  <CheckCircle2 className="w-6 h-6 text-success-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-success-700">{score}</p>
                  <p className="text-xs text-success-600 font-medium">صحيحة</p>
                </div>
                <div className="bg-error-50 border border-error-200 rounded-xl py-4">
                  <XCircle className="w-6 h-6 text-error-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-error-700">{totalQuestions - score}</p>
                  <p className="text-xs text-error-600 font-medium">خاطئة</p>
                </div>
                <div className="bg-warning-50 border border-warning-200 rounded-xl py-4">
                  <AlertCircle className="w-6 h-6 text-warning-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-warning-700">
                    {results.filter((r) => r.timedOut).length}
                  </p>
                  <p className="text-xs text-warning-600 font-medium">انتهى الوقت</p>
                </div>
              </div>

              <SaveStatus state={saveState} error={saveError} onRetry={() => void submitResults()} />

              <h3 className="text-start text-sm font-bold text-slate-700 mb-3">مراجعة الإجابات</h3>
              <ul className="space-y-3 mb-6 text-start">
                {results.map((r, idx) => (
                  <AnswerReview key={r.question.id} result={r} index={idx} />
                ))}
              </ul>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                >
                  <Home className="w-5 h-5" />
                  الرئيسية
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                  إعادة المحاولة
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== EXAM =====
  const hasSecondQuestion = !!currentQuestion?.question_text_2?.trim();
  const optionsGroup1 = [
    { num: 1, text: currentQuestion?.option_1 },
    { num: 2, text: currentQuestion?.option_2 },
  ].filter((o) => o.text);
  const optionsGroup2 = [
    { num: 3, text: currentQuestion?.option_3 },
    { num: 4, text: currentQuestion?.option_4 },
  ].filter((o) => o.text);

  const timerColor =
    timeLeft <= 5
      ? 'text-error-400'
      : timeLeft <= 10
      ? 'text-warning-400'
      : 'text-white';
  const timerRingColor =
    timeLeft <= 5
      ? 'border-error-500'
      : timeLeft <= 10
      ? 'border-warning-500'
      : 'border-primary-500';

  const progressPercent = currentQuestion
    ? ((currentQuestion.timer_duration - timeLeft) / currentQuestion.timer_duration) * 100
    : 0;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-between border-b border-slate-700">
        <button
          onClick={() => navigate(homePath)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:inline">خروج</span>
        </button>
        <div className="flex items-center gap-2.5">
          <Car className="w-5 h-5 text-primary-400" />
          <span className="text-white font-semibold text-sm">{series?.title}</span>
          <span className="px-2 py-0.5 bg-primary-600 text-white text-xs font-bold rounded-full">
            {series?.category}
          </span>
        </div>
        <div className="text-sm text-slate-400">
          {answeredCount}/{totalQuestions} تمّت الإجابة
        </div>
      </div>

      {/* Main exam area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 lg:p-6 max-w-7xl mx-auto w-full">
        {/* Left: Image + Question */}
        <div className="flex-1 flex flex-col gap-3">
          {/* Image area */}
          <div className="relative flex-1 bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 min-h-[280px] lg:min-h-[420px] flex items-center justify-center">
            {currentQuestion?.image_url ? (
              <img
                src={currentQuestion.image_url}
                alt="السيناريو"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-8">
                <div className="w-20 h-20 bg-slate-700 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-slate-500" />
                </div>
                <p className="text-slate-400">لا توجد صورة لهذا السؤال</p>
              </div>
            )}

            {currentQuestion?.question_text && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4 pt-12">
                <p
                  className="text-white text-base lg:text-lg font-medium leading-relaxed"
                  dir="auto"
                >
                  {currentQuestion.question_text}
                </p>
                {hasSecondQuestion && currentQuestion.question_text_2 && (
                  <p
                    className="text-white/80 text-sm lg:text-base font-medium leading-relaxed mt-2 pt-2 border-t border-white/20"
                    dir="auto"
                  >
                    {currentQuestion.question_text_2}
                  </p>
                )}
              </div>
            )}

          </div>

          {/* Progress pills (exam is sequential — no per-question correction) */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <div className="flex gap-1.5 flex-wrap justify-center max-w-md">
              {questions.map((_, idx) => {
                const isAnswered = idx < answeredCount;
                const isCurrent = idx === currentIndex;
                return (
                  <span
                    key={idx}
                    className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                      isCurrent
                        ? 'bg-primary-600 text-white scale-110 shadow-md'
                        : isAnswered
                        ? 'bg-success-600/80 text-white'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Answer controls — compact */}
        <div className="lg:w-72 xl:w-80 flex flex-col gap-3">
          {/* Timer ring */}
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 flex items-center justify-center">
            <div
              className={`relative w-24 h-24 rounded-full border-4 ${timerRingColor} flex items-center justify-center transition-colors`}
            >
              <div
                className="absolute inset-0 rounded-full border-4 border-slate-700"
                style={{
                  background: `conic-gradient(${timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#3b82f6'} ${progressPercent * 3.6}deg, transparent 0deg)`,
                  mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px))',
                  WebkitMask:
                    'radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px))',
                }}
              />
              <span className={`text-3xl font-bold tabular-nums ${timerColor} relative z-10`}>
                {timeLeft}
              </span>
            </div>
          </div>

          {/* Answer buttons — compact rounded pills */}
          <div className="flex flex-col gap-2">
            {optionsGroup1.map((opt) => {
              const isSelected = selectedAnswers.includes(opt.num);
              return (
                <button
                  key={opt.num}
                  onClick={() => toggleAnswer(opt.num)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-full font-medium text-sm transition-all border-2 cursor-pointer ${
                    isSelected
                      ? 'bg-primary-600 border-primary-500 text-white shadow-lg scale-[1.02]'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-750'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      isSelected ? 'bg-white text-primary-600' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {opt.num}
                  </span>
                  <span className="flex-1 text-start line-clamp-1" dir="auto">
                    {opt.text}
                  </span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" />}
                </button>
              );
            })}

            {/* Second question text divider */}
            {hasSecondQuestion && currentQuestion?.question_text_2 && (
              <div className="my-1 px-4 py-2.5 bg-slate-750 border border-slate-600 rounded-xl">
                <p className="text-slate-200 text-xs font-medium leading-relaxed" dir="auto">
                  {currentQuestion.question_text_2}
                </p>
              </div>
            )}

            {optionsGroup2.map((opt) => {
              const isSelected = selectedAnswers.includes(opt.num);
              return (
                <button
                  key={opt.num}
                  onClick={() => toggleAnswer(opt.num)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-full font-medium text-sm transition-all border-2 cursor-pointer ${
                    isSelected
                      ? 'bg-primary-600 border-primary-500 text-white shadow-lg scale-[1.02]'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-750'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      isSelected ? 'bg-white text-primary-600' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {opt.num}
                  </span>
                  <span className="flex-1 text-start line-clamp-1" dir="auto">
                    {opt.text}
                  </span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Action buttons — compact */}
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleCorriger}
              disabled={selectedAnswers.length === 0}
              className="flex-1 py-2.5 bg-error-500/90 hover:bg-error-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full font-semibold text-sm transition-all flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              مسح
            </button>
            <button
              onClick={handleValider}
              disabled={selectedAnswers.length === 0}
              className="flex-1 py-2.5 bg-success-500 hover:bg-success-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full font-semibold text-sm transition-all flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              تأكيد
            </button>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="bg-slate-800 border-t border-slate-700 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Question number */}
          <div className="text-center order-1">
            <span className="text-slate-400 text-sm">
              السؤال{' '}
              <span className="text-white font-bold text-base">{currentIndex + 1}</span> من{' '}
              <span className="text-slate-300 font-semibold">{totalQuestions}</span>
            </span>
          </div>

          {/* Category */}
          <div className="order-2">
            <span className="text-xs px-2.5 py-1 bg-primary-900/50 text-primary-300 rounded-full font-medium border border-primary-800">
              الفئة: {currentQuestion?.category ?? series?.category}
            </span>
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-2 order-3">
            <button
              onClick={() => setAudioMuted(!audioMuted)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {audioMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioMuted ? 0 : audioVolume}
              onChange={(e) => {
                setAudioVolume(parseFloat(e.target.value));
                setAudioMuted(false);
              }}
              className="w-20 sm:w-24"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
