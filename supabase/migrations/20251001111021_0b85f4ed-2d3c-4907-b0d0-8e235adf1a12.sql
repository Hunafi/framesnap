-- Step 1: Create or replace the trigger function to auto-create profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, role, is_admin)
  VALUES (
    NEW.id, 
    NEW.email, 
    'user'::app_role,
    false
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Step 2: Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Step 3: Backfill profiles for existing users who don't have profiles
INSERT INTO public.profiles (user_id, email, role, is_admin)
SELECT 
  au.id,
  au.email,
  'user'::app_role,
  false
FROM auth.users au
LEFT JOIN public.profiles p ON p.user_id = au.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Step 4: Update profiles with admin role based on user_roles table
UPDATE public.profiles
SET 
  role = 'admin'::app_role,
  is_admin = true
WHERE user_id IN (
  SELECT DISTINCT user_id 
  FROM public.user_roles 
  WHERE role = 'admin'::app_role
);

-- Step 5: Update the has_role function to check profiles.role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id AND role = _role
  )
$$;