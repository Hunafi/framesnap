import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
  created_at: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer profile and roles fetch to avoid deadlock
          setTimeout(() => {
            Promise.all([
              supabase
                .from('profiles')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle(),
              supabase
                .from('user_roles')
                .select('*')
                .eq('user_id', session.user.id)
            ]).then(([profileResult, rolesResult]) => {
              if (profileResult.error) {
                console.error('Error fetching profile:', profileResult.error);
                setProfile(null);
              } else {
                setProfile(profileResult.data);
              }
              
              if (rolesResult.error) {
                console.error('Error fetching roles:', rolesResult.error);
                setUserRoles([]);
              } else {
                setUserRoles(rolesResult.data || []);
              }
              
              setLoading(false);
            });
          }, 0);
        } else {
          setProfile(null);
          setUserRoles([]);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Fetch user profile and roles
        Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle(),
          supabase
            .from('user_roles')
            .select('*')
            .eq('user_id', session.user.id)
        ]).then(([profileResult, rolesResult]) => {
          if (profileResult.error) {
            console.error('Error fetching profile:', profileResult.error);
            setProfile(null);
          } else {
            setProfile(profileResult.data);
          }
          
          if (rolesResult.error) {
            console.error('Error fetching roles:', rolesResult.error);
            setUserRoles([]);
          } else {
            setUserRoles(rolesResult.data || []);
          }
          
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    profile,
    userRoles,
    loading,
    signUp,
    signIn,
    signOut,
    isAdmin: userRoles.some(role => role.role === 'admin') || profile?.is_admin || false,
  };
}