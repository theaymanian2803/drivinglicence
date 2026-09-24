/*
# Add second question text column (question_text_2)

## Overview
Some exam questions have two sub-questions: one for options 1-2 and another for options 3-4.
This adds an optional `question_text_2` column to support that use case.

## Changes
- Added `question_text_2` (text, nullable) to `questions` table.
  - When provided, the exam screen shows it above options 3 and 4.
  - When null, all four options belong to the single `question_text`.

## Security
- No RLS changes needed — existing policies already cover the new column.
*/

ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_text_2 text;
