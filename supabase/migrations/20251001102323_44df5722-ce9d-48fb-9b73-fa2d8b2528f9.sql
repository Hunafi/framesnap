-- Fix function search paths for security

-- Update handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, is_admin)
  VALUES (NEW.id, NEW.email, false);
  RETURN NEW;
END;
$$;

-- Update update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Update cleanup_expired_frame_cache function
CREATE OR REPLACE FUNCTION public.cleanup_expired_frame_cache()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.frame_analysis_cache 
  WHERE expires_at < now();
END;
$$;