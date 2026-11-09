-- Run in the GAMES project SQL editor: ysopxengerkvbwhrdnwq.
-- Additive and safe to rerun; does not reset scores or change existing game rules.
BEGIN;
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
    WHERE conrelid='public.scores'::regclass AND conname='scores_game_check';
  IF definition IS NOT NULL AND position('''fruitninja''' IN definition)=0 THEN
    ALTER TABLE public.scores DROP CONSTRAINT scores_game_check;
    EXECUTE 'ALTER TABLE public.scores ADD CONSTRAINT scores_game_check ' ||
      regexp_replace(definition, '^CHECK \((.*)\)$', 'CHECK ((game = ''fruitninja'') OR (\1))');
  END IF;
END $$;
INSERT INTO public.games_config(id,title,page,sort_order)
VALUES ('fruitninja','Fruit Ninja','fruitninja.html',17)
ON CONFLICT (id) DO NOTHING;
COMMIT;
