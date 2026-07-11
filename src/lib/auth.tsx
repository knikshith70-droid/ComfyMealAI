import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { fetchProfile, upsertProfile } from "./api";
import { useI18n, type Lang } from "./i18n";
import type { Profile } from "./supabase";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  ensureProfileRow: (userId: string) => Promise<Profile>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (u: User) => {
    try {
      const p = await fetchProfile(u.id);
      setProfile(p);
      if (p?.language) setLang(p.language as Lang);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to load profile", e);
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Use onAuthStateChange exclusively. INITIAL_SESSION fires immediately with
    // the current session (or null), so we don't need a separate getSession call.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        loadProfile(u).finally(() => {
          // Only clear the loading spinner after the initial session check.
          if (event === "INITIAL_SESSION" && mounted) setLoading(false);
        });
      } else {
        setProfile(null);
        if (event === "INITIAL_SESSION") setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  const ensureProfileRow = async (userId: string): Promise<Profile> => {
    const existing = await fetchProfile(userId);
    if (existing) {
      setProfile(existing);
      return existing;
    }
    const created = await upsertProfile({
      id: userId,
      allergies: [],
      lifestyle: [],
      cuisines: [],
      adults: 1,
      children: 0,
      goals: [],
      cuisine_theme: [],
      comfort_style: [],
      adventure_level: [],
      cooking_skill: [],
      meal_occasion: [],
      flavor_profile: [],
      onboarded: false,
      language: "en",
    });
    setProfile(created);
    return created;
  };

  const value = useMemo<AuthState>(
    () => ({ user, profile, loading, signOut, refreshProfile, ensureProfileRow }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
