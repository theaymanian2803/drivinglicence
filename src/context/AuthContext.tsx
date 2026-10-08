import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/db';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInStudent: (email: string, accessCode: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ user: User }>('/auth/me')
      .then((res) => {
        setUser(res.data?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await api.post<{ user: User }>('/auth/login', { email, password });
    if (res.error) return { error: res.error.message };
    setUser(res.data.user);
    return { error: null };
  };

  const signInStudent = async (email: string, accessCode: string) => {
    const res = await api.post<{ user: User; name: string | null }>('/student-auth/login', {
      email,
      accessCode,
    });
    if (res.error) return { error: res.error.message };
    setUser({ ...res.data.user, name: res.data.name ?? undefined });
    return { error: null };
  };

  const signOut = async () => {
    await api.post('/auth/logout', {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInStudent, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}