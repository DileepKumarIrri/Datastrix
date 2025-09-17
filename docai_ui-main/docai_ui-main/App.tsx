
import React, { useState, useEffect, useCallback } from 'react';
import Login from './components/Login';
import MainApp from './components/MainApp';
import CompleteProfile from './components/CompleteProfile';
import { User } from './types';
import { getUserProfile } from './services/api';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from './services/firebase';
import './styles.css';

const App: React.FC = () => {
  const [dbUser, setDbUser] = useState<User | null>(null); // Full user profile from our DB
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // This function attempts to fetch the user profile from our backend.
  // It's designed to be called after Firebase auth state is confirmed.
  const fetchDbProfile = useCallback(async () => {
    if (!firebaseUser) {
      setDbUser(null);
      return;
    }
    
    try {
      const userProfile = await getUserProfile();
      setDbUser(userProfile);
    } catch (error: any) {
      setDbUser(null); // Clear any old profile
      // If the error is NOT a 404, it's an unexpected server error, so we log out.
      // A 404 is expected for new users and means they need to complete their profile.
      if (error.status !== 404) {
        console.error("An unexpected error occurred while fetching the user profile. Logging out.", error);
        await handleLogout();
      }
    }
  }, [firebaseUser]);

  // Primary effect to listen for Firebase auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Effect to fetch our DB profile once Firebase user is known
  useEffect(() => {
    fetchDbProfile();
  }, [firebaseUser, fetchDbProfile]);

  const handleLogout = async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setDbUser(null);
  };

  const handleProfileCompletion = () => {
    // After the profile is successfully created, re-fetch it.
    fetchDbProfile();
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="app-loading-spinner"></div>
      </div>
    );
  }

  // If a Firebase user exists...
  if (firebaseUser) {
    // ...and their profile from our DB also exists, show the main app.
    if (dbUser) {
      return <MainApp user={dbUser} onLogout={handleLogout} />;
    }
    // ...but their DB profile is missing (e.g., new signup), show the profile completion form.
    return <CompleteProfile onProfileComplete={handleProfileCompletion} userEmail={firebaseUser.email || ''} />;
  }

  // If no Firebase user, show the login page.
  return <Login />;
};

export default App;
