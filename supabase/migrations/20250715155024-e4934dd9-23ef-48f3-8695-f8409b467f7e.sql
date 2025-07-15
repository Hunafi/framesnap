-- First, ensure your profile exists
INSERT INTO profiles (user_id, email, is_admin)
SELECT id, email, true 
FROM auth.users 
WHERE email = 'fonaisz@gmail.com'
ON CONFLICT (user_id) 
DO UPDATE SET is_admin = true;

-- If profile already exists, just update admin status
UPDATE profiles 
SET is_admin = true 
WHERE email = 'fonaisz@gmail.com';