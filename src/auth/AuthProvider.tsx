import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthCtx { session: Session | null; user: User | null; pret: boolean; estAdmin: boolean; deconnexion: () => Promise<void> }
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [pret, setPret] = useState(false);
  const [estAdmin, setEstAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setPret(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setEstAdmin(false); return; }
    supabase.from('platform_admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setEstAdmin(!!data));
  }, [session?.user?.id]);

  const deconnexion = async () => { await supabase.auth.signOut(); localStorage.removeItem('senpaie_entreprise'); };

  return <Ctx.Provider value={{ session, user: session?.user ?? null, pret, estAdmin, deconnexion }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return c;
}
