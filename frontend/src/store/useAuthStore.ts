// Auth Store con Zustand + Supabase
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, User, Session } from '@/lib/supabase';
import { api } from '@/lib/api';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  
  // Actions
  init: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'github' | 'gitlab', redirectTo?: string) => Promise<void>;
  signInWithMagicLink: (email: string, redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: {display_name?: string; avatar_url?: string; timezone?: string; locale?: string; email_notifications?: boolean; daily_summary_time?: string; default_ai_provider?: string; ai_api_keys?: Record<string, string>}) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  resetPassword: (email: string, redirectTo?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      loading: true,
      initialized: false,

      init: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        set({ 
          session, 
          user: session?.user ?? null, 
          loading: false, 
          initialized: true 
        });
        
        if (session?.access_token) {
          api.setToken(session.access_token);
        }
        
        // Escuchar cambios de auth
        supabase.auth.onAuthStateChange((_event, session) => {
          set({ session, user: session?.user ?? null, loading: false });
          if (session?.access_token) {
            api.setToken(session.access_token);
          } else {
            api.setToken(null);
          }
        });
      },

      signUp: async (email, password, displayName) => {
        set({ loading: true });
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (error) throw error;
        set({ loading: false });
      },

      signIn: async (email, password) => {
        set({ loading: true });
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session?.access_token) {
          api.setToken(data.session.access_token);
        }
        set({ loading: false });
      },

      signInWithOAuth: async (provider, redirectTo) => {
        const redirect = redirectTo || `${window.location.origin}/auth/callback`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: redirect },
        });
        if (error) throw error;
      },

      signInWithMagicLink: async (email, redirectTo) => {
        set({ loading: true });
        const redirect = redirectTo || `${window.location.origin}/auth/callback`;
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirect },
        });
        if (error) throw error;
        set({ loading: false });
      },

      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        api.setToken(null);
        set({ user: null, session: null });
      },

      updateProfile: async (data) => {
        const { error } = await supabase.auth.updateUser({ data });
        if (error) throw error;
        // El onAuthStateChange actualizará el store
      },

      updatePassword: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
      },

      resetPassword: async (email, redirectTo) => {
        const redirect = redirectTo || `${window.location.origin}/auth/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
      },

      refreshSession: async () => {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) throw error;
        if (data.session?.access_token) {
          api.setToken(data.session.access_token);
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        session: state.session 
      }),
    }
  )
);

// Hook para usar en componentes
export function useAuth() {
  const store = useAuthStore();
  return store;
}