-- Grant admin role to fonaisz@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('2b644652-a82c-43d8-b5a0-0841c7abd289', 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;