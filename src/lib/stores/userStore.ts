import { create } from "zustand";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/db";
import type { UserRole, KYCStatus } from "@/lib/types";

interface UserState {
  user: FirebaseUser | null;
  role: UserRole | null;
  profileComplete: boolean;
  kycStatus: KYCStatus;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

interface UserStore extends UserState {
  setUser: (user: FirebaseUser | null) => void;
  setUserData: (data: Partial<Omit<UserState, "user" | "loading" | "initialized" | "error">>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  initialize: () => () => void;
  reset: () => void;
}

const initialState: UserState = {
  user: null,
  role: null,
  profileComplete: false,
  kycStatus: "none",
  loading: true,
  initialized: false,
  error: null,
};

export const useUserStore = create<UserStore>((set, get) => ({
  ...initialState,

  setUser: (user) => set({ user }),

  setUserData: (data) => set(data),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  initialize: () => {
    let unsubscribeFirestore: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // User is signed out
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
        set({
          user: null,
          role: null,
          profileComplete: false,
          kycStatus: "none",
          loading: false,
          initialized: true,
          error: null,
        });
        return;
      }

      // User is signed in
      set({ user, loading: true, error: null });

      // Listen to user document in Firestore
      const userDocRef = doc(db, "users", user.uid);
      unsubscribeFirestore = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            set({
              role: (data.role as UserRole) || null,
              profileComplete: data.profileComplete || false,
              kycStatus: (data.kycStatus as KYCStatus) || "none",
              loading: false,
              initialized: true,
              error: null,
            });
          } else {
            // Document doesn't exist yet (shouldn't happen after signup)
            set({
              role: null,
              profileComplete: false,
              kycStatus: "none",
              loading: false,
              initialized: true,
              error: "User profile not found",
            });
          }
        },
        (error) => {
          console.error("Error listening to user document:", error);
          set({
            loading: false,
            initialized: true,
            error: error.message,
          });
        }
      );
    });

    // Return cleanup function
    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  },

  reset: () => set(initialState),
}));

// Selectors
export const selectUser = (state: UserStore) => state.user;
export const selectRole = (state: UserStore) => state.role;
export const selectIsIssuer = (state: UserStore) => state.role === "issuer";
export const selectIsInvestor = (state: UserStore) => state.role === "investor";
export const selectProfileComplete = (state: UserStore) => state.profileComplete;
export const selectKYCStatus = (state: UserStore) => state.kycStatus;
export const selectKYCApproved = (state: UserStore) => state.kycStatus === "approved";
export const selectLoading = (state: UserStore) => state.loading;
export const selectInitialized = (state: UserStore) => state.initialized;
export const selectError = (state: UserStore) => state.error;

// Combined selectors for guards
export const selectCanCreateBond = (state: UserStore) =>
  state.role === "issuer" && state.profileComplete && state.kycStatus === "approved";

