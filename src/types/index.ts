export interface Series {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  category: string;
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
}
