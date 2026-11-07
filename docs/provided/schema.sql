-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'creator'::text CHECK (role = ANY (ARRAY['creator'::text, 'admin'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.materials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  grade smallint NOT NULL CHECK (grade >= 1 AND grade <= 12),
  topic text NOT NULL,
  description text,
  prompt_context text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT materials_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quizzes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  material_id uuid,
  title text NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 120),
  description text,
  source text NOT NULL DEFAULT 'manual'::text CHECK (source = ANY (ARRAY['manual'::text, 'ai'::text])),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])),
  share_code text NOT NULL DEFAULT upper(substr(md5((random())::text), 1, 6)) UNIQUE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quizzes_pkey PRIMARY KEY (id),
  CONSTRAINT quizzes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id),
  CONSTRAINT quizzes_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id)
);
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL,
  position integer NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['multiple_choice'::text, 'text'::text])),
  body text NOT NULL,
  options jsonb,
  explanation text,
  points integer NOT NULL DEFAULT 1 CHECK (points > 0),
  CONSTRAINT questions_pkey PRIMARY KEY (id),
  CONSTRAINT questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
);
CREATE TABLE public.question_keys (
  question_id uuid NOT NULL,
  correct_index integer,
  accepted_answers ARRAY,
  CONSTRAINT question_keys_pkey PRIMARY KEY (question_id),
  CONSTRAINT question_keys_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL,
  participant_name text NOT NULL CHECK (char_length(participant_name) >= 1 AND char_length(participant_name) <= 40),
  score integer NOT NULL DEFAULT 0,
  max_score integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attempts_pkey PRIMARY KEY (id),
  CONSTRAINT attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
);
CREATE TABLE public.attempt_answers (
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  answer jsonb,
  is_correct boolean NOT NULL,
  points_awarded integer NOT NULL,
  CONSTRAINT attempt_answers_pkey PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT attempt_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.attempts(id),
  CONSTRAINT attempt_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.ai_generations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  material_id uuid,
  prompt text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'success'::text, 'invalid_json'::text, 'error'::text])),
  output jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_generations_pkey PRIMARY KEY (id),
  CONSTRAINT ai_generations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT ai_generations_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id)
);