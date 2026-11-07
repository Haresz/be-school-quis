-- =====================================================================
-- save_quiz(p_quiz jsonb) — simpan/ubah kuis + soal + kunci dalam SATU transaksi
-- Jalankan SETELAH schema.sql.
--
-- Input (buat baru: tanpa "id"; ubah: sertakan "id"):
-- {
--   "id": null,
--   "material_id": null,
--   "title": "Pecahan Kelas 5",
--   "description": "Latihan dasar",
--   "source": "manual",                -- 'manual' | 'ai'
--   "status": "draft",                 -- 'draft' | 'published'
--   "settings": {"reveal_answers": true},
--   "questions": [
--     {"type": "multiple_choice", "body": "1/2 + 1/4 = ?",
--      "options": ["1/4", "2/6", "3/4", "1"], "correct_index": 2,
--      "explanation": "Samakan penyebut", "points": 1},
--     {"type": "text", "body": "Ibu kota Indonesia?",
--      "accepted_answers": ["jakarta", "dki jakarta"], "points": 1}
--   ]
-- }
--
-- Output: {"id": "<uuid>", "share_code": "AB12CD"}
--
-- Kode error (pesan exception) yang bisa dipetakan di frontend:
--   not_authenticated, quiz_not_found, quiz_has_attempts, invalid_quiz: <detail>
-- =====================================================================

create or replace function public.save_quiz(p_quiz jsonb)
returns jsonb
language plpgsql
security invoker               -- RLS tetap berlaku sebagai user pemanggil
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_id         uuid;
  v_share_code text;
  v_title      text;
  v_questions  jsonb;
  v_q          jsonb;
  v_pos        int;
  v_type       text;
  v_qid        uuid;
  v_opts       jsonb;
  v_opt        jsonb;
  v_ans        jsonb;
  v_idx        numeric;
  v_total      int;
  v_distinct   int;
begin
  -- ---------- validasi tingkat kuis ----------
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if jsonb_typeof(p_quiz) is distinct from 'object' then
    raise exception 'invalid_quiz: payload harus berupa objek JSON' using errcode = '22023';
  end if;

  v_title := trim(coalesce(p_quiz->>'title', ''));
  if char_length(v_title) not between 1 and 120 then
    raise exception 'invalid_quiz: title harus 1-120 karakter' using errcode = '22023';
  end if;

  if coalesce(p_quiz->>'source', 'manual') not in ('manual', 'ai') then
    raise exception 'invalid_quiz: source harus manual atau ai' using errcode = '22023';
  end if;

  if coalesce(p_quiz->>'status', 'draft') not in ('draft', 'published') then
    raise exception 'invalid_quiz: status harus draft atau published' using errcode = '22023';
  end if;

  if p_quiz ? 'settings' and jsonb_typeof(p_quiz->'settings') is distinct from 'object' then
    raise exception 'invalid_quiz: settings harus berupa objek' using errcode = '22023';
  end if;

  v_questions := p_quiz->'questions';
  if jsonb_typeof(v_questions) is distinct from 'array' then
    raise exception 'invalid_quiz: questions harus berupa array' using errcode = '22023';
  end if;
  if jsonb_array_length(v_questions) not between 1 and 50 then
    raise exception 'invalid_quiz: jumlah soal harus 1-50' using errcode = '22023';
  end if;

  -- ---------- buat baru atau ubah ----------
  v_id := nullif(p_quiz->>'id', '')::uuid;

  if v_id is null then
    insert into public.quizzes (owner_id, material_id, title, description, source, status, settings)
    values (
      v_uid,
      nullif(p_quiz->>'material_id', '')::uuid,
      v_title,
      nullif(trim(p_quiz->>'description'), ''),
      coalesce(p_quiz->>'source', 'manual'),
      coalesce(p_quiz->>'status', 'draft'),
      coalesce(p_quiz->'settings', '{}'::jsonb)
    )
    returning id, share_code into v_id, v_share_code;
  else
    perform 1 from public.quizzes where id = v_id and owner_id = v_uid for update;
    if not found then
      raise exception 'quiz_not_found' using errcode = 'P0002';
    end if;

    -- Mengganti soal akan menghapus detail jawaban peserta (cascade).
    -- Karena itu pengubahan soal ditolak jika sudah ada yang mengerjakan.
    if exists (select 1 from public.attempts where quiz_id = v_id) then
      raise exception 'quiz_has_attempts' using errcode = '55000';
    end if;

    update public.quizzes
       set material_id = nullif(p_quiz->>'material_id', '')::uuid,
           title       = v_title,
           description = nullif(trim(p_quiz->>'description'), ''),
           source      = coalesce(p_quiz->>'source', 'manual'),
           status      = coalesce(p_quiz->>'status', 'draft'),
           settings    = coalesce(p_quiz->'settings', '{}'::jsonb)
     where id = v_id
     returning share_code into v_share_code;

    delete from public.questions where quiz_id = v_id;  -- question_keys ikut terhapus
  end if;

  -- ---------- soal + kunci ----------
  for v_q, v_pos in
    select value, ordinality from jsonb_array_elements(v_questions) with ordinality
  loop
    if jsonb_typeof(v_q) is distinct from 'object' then
      raise exception 'invalid_quiz: soal %: harus berupa objek', v_pos using errcode = '22023';
    end if;

    if nullif(trim(v_q->>'body'), '') is null then
      raise exception 'invalid_quiz: soal %: body wajib diisi', v_pos using errcode = '22023';
    end if;

    v_type := v_q->>'type';

    if v_type = 'multiple_choice' then
      v_opts := v_q->'options';

      if jsonb_typeof(v_opts) is distinct from 'array' then
        raise exception 'invalid_quiz: soal %: options harus array', v_pos using errcode = '22023';
      end if;
      if jsonb_array_length(v_opts) not between 2 and 6 then
        raise exception 'invalid_quiz: soal %: options harus 2-6 pilihan', v_pos using errcode = '22023';
      end if;

      for v_opt in select value from jsonb_array_elements(v_opts) loop
        if jsonb_typeof(v_opt) is distinct from 'string' then
          raise exception 'invalid_quiz: soal %: setiap opsi harus string', v_pos using errcode = '22023';
        end if;
        if trim(v_opt #>> '{}') = '' then
          raise exception 'invalid_quiz: soal %: opsi tidak boleh kosong', v_pos using errcode = '22023';
        end if;
      end loop;

      select count(*), count(distinct lower(trim(o #>> '{}')))
        into v_total, v_distinct
        from jsonb_array_elements(v_opts) o;
      if v_total <> v_distinct then
        raise exception 'invalid_quiz: soal %: opsi tidak boleh duplikat', v_pos using errcode = '22023';
      end if;

      if jsonb_typeof(v_q->'correct_index') is distinct from 'number' then
        raise exception 'invalid_quiz: soal %: correct_index harus angka', v_pos using errcode = '22023';
      end if;
      v_idx := (v_q->>'correct_index')::numeric;
      if v_idx <> trunc(v_idx) or v_idx < 0 or v_idx >= jsonb_array_length(v_opts) then
        raise exception 'invalid_quiz: soal %: correct_index di luar rentang opsi', v_pos using errcode = '22023';
      end if;

      insert into public.questions (quiz_id, position, type, body, options, explanation, points)
      values (
        v_id, v_pos, 'multiple_choice', trim(v_q->>'body'), v_opts,
        nullif(trim(v_q->>'explanation'), ''),
        coalesce((v_q->>'points')::int, 1)
      )
      returning id into v_qid;

      insert into public.question_keys (question_id, correct_index)
      values (v_qid, v_idx::int);

    elsif v_type = 'text' then
      v_ans := v_q->'accepted_answers';

      if jsonb_typeof(v_ans) is distinct from 'array' then
        raise exception 'invalid_quiz: soal %: accepted_answers harus array', v_pos using errcode = '22023';
      end if;
      if jsonb_array_length(v_ans) = 0 then
        raise exception 'invalid_quiz: soal %: accepted_answers minimal 1 jawaban', v_pos using errcode = '22023';
      end if;

      for v_opt in select value from jsonb_array_elements(v_ans) loop
        if jsonb_typeof(v_opt) is distinct from 'string' then
          raise exception 'invalid_quiz: soal %: jawaban harus string', v_pos using errcode = '22023';
        end if;
        if trim(v_opt #>> '{}') = '' then
          raise exception 'invalid_quiz: soal %: jawaban tidak boleh kosong', v_pos using errcode = '22023';
        end if;
      end loop;

      insert into public.questions (quiz_id, position, type, body, options, explanation, points)
      values (
        v_id, v_pos, 'text', trim(v_q->>'body'), null,
        nullif(trim(v_q->>'explanation'), ''),
        coalesce((v_q->>'points')::int, 1)
      )
      returning id into v_qid;

      insert into public.question_keys (question_id, accepted_answers)
      values (
        v_qid,
        array(select trim(a #>> '{}') from jsonb_array_elements(v_ans) a)
      );

    else
      raise exception 'invalid_quiz: soal %: type harus multiple_choice atau text', v_pos
        using errcode = '22023';
    end if;
  end loop;

  return jsonb_build_object('id', v_id, 'share_code', v_share_code);
end $$;

-- Hanya user yang login yang boleh memanggil
revoke all on function public.save_quiz(jsonb) from public, anon;
grant execute on function public.save_quiz(jsonb) to authenticated;

-- =====================================================================
-- UJI DI SQL EDITOR (SQL Editor berjalan sebagai role postgres, jadi
-- auth.uid() kosong; tiru user login seperti ini). Buat dulu satu user
-- lewat Authentication → Users, lalu ganti <USER_UUID>.
--
-- begin;
-- select set_config('request.jwt.claims',
--   json_build_object('sub', '<USER_UUID>', 'role', 'authenticated')::text, true);
-- set local role authenticated;
--
-- select public.save_quiz('{
--   "title": "Tes",
--   "questions": [
--     {"type":"multiple_choice","body":"1+1?","options":["1","2"],"correct_index":1},
--     {"type":"text","body":"Ibu kota Indonesia?","accepted_answers":["jakarta"]}
--   ]
-- }'::jsonb);
--
-- rollback;   -- ganti commit jika ingin menyimpan hasil uji
-- =====================================================================