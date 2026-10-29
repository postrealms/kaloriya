-- Повністю прибирає модуль відгуків з бази (таблиці й усі збережені оцінки та повідомлення).
-- Решта даних (акаунти, історія, ліміти) не зачіпаються.
drop table if exists public.meal_ratings;
drop table if exists public.feedback_messages;
