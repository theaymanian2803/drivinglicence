export interface SerializedSeries {
  id: string;
  title: string;
  description: string | null;
  is_active: number;
  category: string;
  created_at: string;
  updated_at: string;
  question_count?: number;
}

export interface SerializedQuestion {
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
  timer_duration: number;
  category: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SerializedUser {
  id: string;
  email: string;
  created_at: string;
}

export function toSeries(row: Record<string, unknown>): SerializedSeries {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    is_active: Number(row.is_active),
    category: row.category as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    ...(row.question_count !== undefined
      ? { question_count: Number(row.question_count) }
      : {}),
  };
}

export function toQuestion(row: Record<string, unknown>): SerializedQuestion {
  let correctAnswers: number[] = [];
  try {
    const parsed = JSON.parse(row.correct_answers as string);
    if (Array.isArray(parsed)) correctAnswers = parsed as number[];
  } catch {
    correctAnswers = [];
  }
  return {
    id: row.id as string,
    series_id: row.series_id as string,
    image_url: (row.image_url as string | null) ?? null,
    audio_url: (row.audio_url as string | null) ?? null,
    question_text: row.question_text as string,
    question_text_2: (row.question_text_2 as string | null) ?? null,
    option_1: row.option_1 as string,
    option_2: row.option_2 as string,
    option_3: (row.option_3 as string | null) ?? null,
    option_4: (row.option_4 as string | null) ?? null,
    correct_answers: correctAnswers,
    timer_duration: Number(row.timer_duration),
    category: row.category as string,
    position: Number(row.position),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function toUser(row: Record<string, unknown>): SerializedUser {
  return {
    id: row.id as string,
    email: row.email as string,
    created_at: row.created_at as string,
  };
}