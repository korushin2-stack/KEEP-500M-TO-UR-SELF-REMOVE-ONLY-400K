import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

// Strict in-memory token storage (never localStorage or sessionStorage)
let inMemoryGoogleAccessToken: string | null = null;
let inMemoryFirebaseIdToken: string | null = null;
let isSigningInFlag = false;

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isSigningIn: boolean;
  googleAccessToken: string | null;
  authError: string | null;
  signInWithGoogle: () => Promise<boolean>;
  logout: () => Promise<void>;
  getFirebaseIdToken: () => Promise<string | null>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        setUser(nextUser);
        try {
          inMemoryFirebaseIdToken = await nextUser.getIdToken();
        } catch {
          inMemoryFirebaseIdToken = null;
        }
        if (!isSigningInFlag && inMemoryGoogleAccessToken) {
          setGoogleAccessToken(inMemoryGoogleAccessToken);
        }
      } else {
        inMemoryGoogleAccessToken = null;
        inMemoryFirebaseIdToken = null;
        setUser(null);
        setGoogleAccessToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsSigningIn(true);
    isSigningInFlag = true;
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const idToken = await result.user.getIdToken();
      inMemoryFirebaseIdToken = idToken;
      inMemoryGoogleAccessToken = credential?.accessToken || null;
      setGoogleAccessToken(inMemoryGoogleAccessToken);
      setUser(result.user);
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to complete Google authentication.';
      setAuthError(message);
      return false;
    } finally {
      isSigningInFlag = false;
      setIsSigningIn(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    inMemoryGoogleAccessToken = null;
    inMemoryFirebaseIdToken = null;
    setGoogleAccessToken(null);
    setUser(null);
  }, []);

  const getFirebaseIdToken = useCallback(async () => {
    if (!auth.currentUser) return inMemoryFirebaseIdToken;
    const fresh = await auth.currentUser.getIdToken();
    inMemoryFirebaseIdToken = fresh;
    return fresh;
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isSigningIn,
        googleAccessToken,
        authError,
        signInWithGoogle,
        logout,
        getFirebaseIdToken,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
