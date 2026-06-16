UPDATE public.member_credentials
SET password_hash = extensions.crypt('blessed', extensions.gen_salt('bf', 10)),
    updated_at = now()
WHERE member_id = '0356ea25-e02f-4df8-b66f-7dd5704c0883';

UPDATE public.members SET has_password = true WHERE id = '0356ea25-e02f-4df8-b66f-7dd5704c0883';

DELETE FROM public.member_sessions WHERE member_id = '0356ea25-e02f-4df8-b66f-7dd5704c0883';