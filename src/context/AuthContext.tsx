import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from '../firebase.js';
import { UserProfile, SavedVisit } from '../types.js';
import {
  syncUserProfile,
  updateUserRole,
  fetchUserSavedVisits,
  saveUserVisit,
  removeUserVisit,
} from '../services/userService.js';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isStaff: boolean;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  elevateToStaff: (passcode: string) => Promise<{ success: boolean; error?: string }>;
  savedVisits: SavedVisit[];
  saveVisit: (visit: Omit<SavedVisit, 'id' | 'savedAt'>) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [savedVisits, setSavedVisits] = useState<SavedVisit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const isStaff = profile?.role === 'staff' || profile?.role === 'admin';

  // Listen to Firebase auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userProf = await syncUserProfile(
            firebaseUser.uid,
            firebaseUser.email,
            firebaseUser.displayName
          );
          setProfile(userProf);

          // Fetch saved visits
          const visits = await fetchUserSavedVisits(firebaseUser.uid);
          setSavedVisits(visits);
        } catch (err) {
          console.warn('Error syncing profile from Firestore, using authenticated session fallback:', err);
          setProfile({
            id: firebaseUser.uid,
            email: firebaseUser.email || null,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Visitor',
            role: 'visitor',
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        setProfile(null);
        setSavedVisits([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setAuthError(msg);
      console.warn('Google sign-in error:', err);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(auth);
      setProfile(null);
      setSavedVisits([]);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  }, []);

  const elevateToStaff = useCallback(
    async (passcode: string): Promise<{ success: boolean; error?: string }> => {
      if (!user) {
        return { success: false, error: 'Please sign in first to verify staff credentials.' };
      }

      try {
        const res = await fetch('/api/auth/verify-staff-passcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode }),
        });

        const data = await res.json();
        if (!res.ok || !data.valid) {
          return { success: false, error: data.error || 'Invalid staff authorization code.' };
        }

        // Elevate user role in Firestore
        await updateUserRole(user.uid, 'staff');
        setProfile((prev) => (prev ? { ...prev, role: 'staff' } : null));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to verify staff authorization.',
        };
      }
    },
    [user]
  );

  const saveVisit = useCallback(
    async (visit: Omit<SavedVisit, 'id' | 'savedAt'>) => {
      if (!user) throw new Error('You must be signed in to save queue visit tickets.');
      const saved = await saveUserVisit(user.uid, visit);
      setSavedVisits((prev) => [saved, ...prev.filter((v) => v.id !== saved.id)]);
    },
    [user]
  );

  const deleteVisit = useCallback(
    async (visitId: string) => {
      if (!user) return;
      await removeUserVisit(user.uid, visitId);
      setSavedVisits((prev) => prev.filter((v) => v.id !== visitId));
    },
    [user]
  );

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isStaff,
        loading,
        authError,
        signInWithGoogle,
        signOutUser,
        elevateToStaff,
        savedVisits,
        saveVisit,
        deleteVisit,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
