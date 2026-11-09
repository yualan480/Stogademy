-- Run in the ORBIT project SQL editor: qtmrtxgkisshdtqshjre.
-- Enables the normal end-of-round Orbits reward; preserves any owner-configured rate.
INSERT INTO public.game_rates(game,permille)
VALUES ('fruitninja',500)
ON CONFLICT (game) DO NOTHING;
