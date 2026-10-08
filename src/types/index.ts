export interface Series {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  category: string;
  pass_score: number;
  required_questions: number;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  series_id: string;
  image_url: string | null;
  audio_url: string | null;
  question_text: string;
  question_text_2: string | null;
  option_1: string;
  option_2: string;
  option_3: string | null;
  option_4: string | null;
  correct_answers: number[];
  timer_duration: 10 | 20 | 30;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionInput {
  series_id: string;
  image_url: string | null;
  audio_url: string | null;
  question_text: string;
  question_text_2: string | null;
  option_1: string;
  option_2: string;
  option_3: string | null;
  option_4: string | null;
  correct_answers: number[];
  timer_duration: 10 | 20 | 30;
  category: string;
}

export interface SeriesInput {
  title: string;
  description: string | null;
  is_active: boolean;
  category: string;
  pass_score: number;
  required_questions: number;
}

export interface SeriesWithCount extends Series {
  question_count: number;
}

export type Role = 'admin' | 'student';

export interface User {
  id: string;
  email: string;
  role: Role;
  name?: string;
}

export interface Student {
  id: string;
  name: string | null;
  email: string;
  access_code: string;
  is_active: boolean;
  created_at: string;
  attempt_count?: number;
}

export interface ExamAttempt {
  id: string;
  series_id: string;
  series_title: string | null;
  score: number;
  total_questions: number;
  passed: boolean;
  created_at: string;
}

export interface RevisionQuestion extends Question {
  wrong_count: number;
  series_title: string | null;
  corrected_at: string | null;
}

export interface RevisionSummary {
  to_review: RevisionQuestion[];
  corrected: RevisionQuestion[];
  weak_areas: WeakArea[];
}

export interface WeakArea {
  category: string;
  question_count: number;
  wrong_total: number;
}

export interface CompleteRevisionResult {
  ok: boolean;
  summary: RevisionSummary;
}

export const SIGN_CATEGORIES = [
  'Danger',
  'Interdiction',
  'Obligation',
  'Indication',
  'Précédence',
  'Signalisation temporaire',
] as const;

export type SignCategory = (typeof SIGN_CATEGORIES)[number];

export interface TrafficSign {
  id: string;
  title: string;
  category: string;
  image_url: string;
  description: string;
  scenario_image_url: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SignInput {
  title: string;
  category: string;
  image_url: string;
  description: string;
  scenario_image_url: string | null;
  is_active: boolean;
}

export type OfficialExamMeta = {
  pass_score: number;
  question_count: number;
  timer_duration: number;
};

export type OfficialExamStart = OfficialExamMeta & {
  questions: Question[];
};

export type ReadyTrend = 'up' | 'down' | 'flat';

export interface Readiness {
  readiness_pct: number;
  attempts_pass_rate: number;
  revision_clearance: number;
  trend: ReadyTrend;
  attempts_count: number;
  to_review: number;
  corrected: number;
}
