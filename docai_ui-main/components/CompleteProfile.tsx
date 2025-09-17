import React, { useState, useEffect, useRef } from 'react';
import { registerProfile, sendOtp, verifyOtp, cancelSignup } from '../services/api';
import { SpinnerIcon } from './Icons';
import OtpInput from './OtpInput';
import { auth } from '../services/firebase';

interface CompleteProfileProps {
    onProfileComplete: () => void;
    userEmail: string;
}

type Stage = 'otp' | 'profile';

const CompleteProfile: React.FC<CompleteProfileProps> = ({ onProfileComplete, userEmail }) => {
    const [stage, setStage] = useState<Stage>('otp');
    
    // OTP state
    const [otp, setOtp] = useState('');

    // Profile state
    const [name, setName] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [designation, setDesignation] = useState('');
    
    // Common state
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const otpRequestSent = useRef(false);

    useEffect(() => {
        const otpVerified = sessionStorage.getItem('otpForSignupVerified') === 'true';

        if (otpVerified) {
            setStage('profile');
            return;
        }

        const requestOtp = async () => {
            if (userEmail && !otpRequestSent.current) {
                otpRequestSent.current = true; // Set flag immediately to prevent re-triggers
                setLoading(true);
                try {
                    await sendOtp({ email: userEmail, purpose: 'signup' });
                } catch (err: any) {
                    setError(err.message || 'Failed to send OTP. Please try refreshing the page.');
                } finally {
                    setLoading(false);
                }
            }
        };
        requestOtp();
    }, [userEmail]);

    const handleOtpSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await verifyOtp({ email: userEmail, otp, purpose: 'signup' });
            sessionStorage.setItem('otpForSignupVerified', 'true');
            setStage('profile'); // Move to the next stage
        } catch (err: any) {
            setError(err.message || 'OTP verification failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleProfileSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        if (!name.trim() || !organizationName.trim() || !designation.trim()) {
            setError("All fields are required.");
            setLoading(false);
            return;
        }

        try {
            await registerProfile({ name, organizationName, designation });
            sessionStorage.removeItem('otpForSignupVerified');
            onProfileComplete();
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };
    
    const handleCancelSignup = async () => {
        setLoading(true);
        setError(null);
        try {
            // Delete the orphaned Firebase user from the backend
            await cancelSignup();
            sessionStorage.removeItem('otpForSignupVerified');
            // Sign out locally
            await auth.signOut();
            // The onAuthStateChanged listener in App.tsx will handle redirecting to the login page
        } catch (err: any) {
            setError(err.message || "Could not cancel signup. Please refresh the page.");
            setLoading(false);
        }
    };

    if (stage === 'otp') {
        return (
            <div className="login-container">
                <div className="login-box">
                    <h2>Verify Your Account</h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '-1rem', marginBottom: '1.5rem' }}>
                        An OTP has been sent to <strong>{userEmail}</strong>. Please enter it below.
                    </p>
                    <form onSubmit={handleOtpSubmit}>
                        <div className="input-group">
                            <label htmlFor="otp">One-Time Password (OTP)</label>
                            <OtpInput value={otp} onChange={setOtp} />
                        </div>
                        {error && <p className="error-message" role="alert">{error}</p>}
                        <button type="submit" disabled={loading || otp.length < 6}>
                            {loading && !error ? <SpinnerIcon /> : null}
                            {loading && !error ? 'Verifying...' : 'Verify & Continue'}
                        </button>
                        <button type="button" className="back-button" onClick={handleCancelSignup} disabled={loading}>
                            Cancel and Go Back
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="login-container">
            <div className="login-box" style={{ maxWidth: '450px' }}>
                <h2>Complete Your Profile</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: '-1rem', marginBottom: '1.5rem' }}>
                    Welcome! Your account for <strong style={{ color: 'var(--text-primary)'}}>{userEmail}</strong> has been verified. Just a few more details to get you started.
                </p>
                <form onSubmit={handleProfileSubmit}>
                    <div className="input-group">
                        <label htmlFor="name">Full Name</label>
                        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Your Full Name" />
                    </div>
                    <div className="input-group">
                        <label htmlFor="organizationName">Organization Name</label>
                        <input id="organizationName" type="text" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required aria-label="Your Organization's Name" />
                    </div>
                    <div className="input-group">
                        <label htmlFor="designation">Designation</label>
                        <input id="designation" type="text" value={designation} onChange={(e) => setDesignation(e.target.value)} required aria-label="Your Designation or Role" />
                    </div>
                    
                    {error && <p className="error-message" role="alert">{error}</p>}
                    
                    <button type="submit" disabled={loading}>
                        {loading ? <SpinnerIcon /> : null}
                        {loading ? 'Saving...' : 'Finish Setup & Enter App'}
                    </button>
                     <button type="button" className="back-button" onClick={handleCancelSignup} disabled={loading}>
                        Cancel and Go Back
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CompleteProfile;