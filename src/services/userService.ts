import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { UserProfile, SavedVisit, UserRole } from '../types.js';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Ensures user profile exists in Firestore, or creates default visitor profile
 */
export async function syncUserProfile(uid: string, email: string | null, displayName: string | null): Promise<UserProfile> {
  const userRef = doc(db, 'users', uid);
  const path = `users/${uid}`;

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const newProfile: UserProfile = {
      id: uid,
      email: email || null,
      displayName: displayName || email?.split('@')[0] || 'Visitor',
      role: 'visitor',
      createdAt: new Date().toISOString(),
    };

    await setDoc(userRef, newProfile);
    return newProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Elevates user profile role to staff
 */
export async function updateUserRole(uid: string, newRole: UserRole): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? snap.data() : {};
    await setDoc(
      userRef,
      {
        ...existing,
        id: uid,
        role: newRole,
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Fetches user saved visits
 */
export async function fetchUserSavedVisits(uid: string): Promise<SavedVisit[]> {
  const colRef = collection(db, 'users', uid, 'savedVisits');
  const path = `users/${uid}/savedVisits`;
  try {
    const q = query(colRef);
    const snap = await getDocs(q);
    const results: SavedVisit[] = [];
    snap.forEach((d) => {
      results.push(d.data() as SavedVisit);
    });
    // Sort newest first
    return results.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Saves a new queue visit ticket
 */
export async function saveUserVisit(uid: string, visit: Omit<SavedVisit, 'id' | 'savedAt'>): Promise<SavedVisit> {
  const visitId = `visit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const visitRef = doc(db, 'users', uid, 'savedVisits', visitId);
  const path = `users/${uid}/savedVisits/${visitId}`;

  const fullVisit: SavedVisit = {
    ...visit,
    id: visitId,
    savedAt: new Date().toISOString(),
  };

  try {
    await setDoc(visitRef, fullVisit);
    return fullVisit;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Deletes a saved visit
 */
export async function removeUserVisit(uid: string, visitId: string): Promise<void> {
  const visitRef = doc(db, 'users', uid, 'savedVisits', visitId);
  const path = `users/${uid}/savedVisits/${visitId}`;
  try {
    await deleteDoc(visitRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}
