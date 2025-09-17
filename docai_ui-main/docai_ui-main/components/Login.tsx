import React, { useState } from 'react';
import { auth } from '../services/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { forgotPasswordInitiate, forgotPasswordConfirm } from '../services/api';
import { SpinnerIcon } from './Icons';
import OtpInput from './OtpInput';

type View = 'login' | 'signup' | 'forgotPassword';
type ForgotPasswordStage = 'email' | 'otp' | 'reset';

const Login: React.FC = () => {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  
  // State for forgot password flow
  const [forgotPasswordStage, setForgotPasswordStage] = useState<ForgotPasswordStage>('email');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');


  const resetForm = (clearFields = true) => {
    setError(null);
    setSuccessMessage('');
    if(clearFields) {
      setEmail('');
      setPassword('');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleViewChange = (newView: View) => {
    setView(newView);
    setForgotPasswordStage('email');
    resetForm();
  };

  const handleForgotPassword = async () => {
      setLoading(true);
      setError(null);
      setSuccessMessage('');
      try {
        if (forgotPasswordStage === 'email') {
            await forgotPasswordInitiate(email);
            setForgotPasswordStage('otp');
            setSuccessMessage(`OTP sent to ${email}. Please check your inbox.`);
        } else if (forgotPasswordStage === 'otp') {
            // A simple check to move to the next stage. The real OTP verification happens with the password.
            setForgotPasswordStage('reset');
        } else if (forgotPasswordStage === 'reset') {
            if (newPassword !== confirmPassword) {
                setError('Passwords do not match.');
                setLoading(false);
                return;
            }
            await forgotPasswordConfirm({ email, otp, newPassword });
            setSuccessMessage('Password has been reset successfully! Please log in with your new password.');
            handleViewChange('login');
        }
      } catch (err: any) {
          setError(err.message || "An unexpected error occurred.");
      } finally {
          setLoading(false);
      }
  };


  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (view === 'forgotPassword') {
        handleForgotPassword();
        return;
    }

    setLoading(true);
    resetForm(false);

    try {
      if (view === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (view === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
        const errorCode = err.code;
        let friendlyMessage = "An unexpected error occurred.";
        switch (errorCode) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                friendlyMessage = 'Invalid email or password.';
                break;
            case 'auth/email-already-in-use':
                friendlyMessage = 'An account with this email already exists.';
                break;
            case 'auth/weak-password':
                friendlyMessage = 'The password is too weak. It must be at least 6 characters long.';
                break;
            case 'auth/invalid-email':
                friendlyMessage = 'Please enter a valid email address.';
                break;
            default:
                friendlyMessage = err.message;
                break;
        }
        setError(friendlyMessage);
    } finally {
        setLoading(false);
    }
  };

  const renderForgotPasswordView = () => (
    <>
      <h2>Reset Your Password</h2>
      {forgotPasswordStage === 'email' && (
        <div className="input-group">
            <label htmlFor="email">Work Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Work Email" />
        </div>
      )}
      {forgotPasswordStage === 'otp' && (
        <div className="input-group">
            <label htmlFor="otp">One-Time Password (OTP)</label>
            <OtpInput value={otp} onChange={setOtp} />
        </div>
      )}
      {forgotPasswordStage === 'reset' && (
        <>
            <div className="input-group">
                <label htmlFor="new-password">New Password</label>
                <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required aria-label="New Password" />
            </div>
            <div className="input-group">
                <label htmlFor="confirm-password">Confirm New Password</label>
                <input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required aria-label="Confirm New Password" />
            </div>
        </>
      )}
    </>
  );

  return (
    <div className="login-container">
        <div className="login-box">
            <form onSubmit={handleSubmit}>
                {view !== 'forgotPassword' ? (
                  <>
                    <h2>{view === 'login' ? 'Welcome Back!' : 'Create an Account'}</h2>
                    <div className="input-group">
                        <label htmlFor="email">Work Email</label>
                        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Work Email" />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required aria-label="Password" />
                    </div>
                  </>
                ) : (
                    renderForgotPasswordView()
                )}

                {error && <p className="error-message" role="alert">{error}</p>}
                {successMessage && <p className="success-message" role="alert">{successMessage}</p>}
                
                <button type="submit" disabled={loading}>
                    {loading ? <SpinnerIcon /> : null}
                    {loading ? 'Loading...' : 
                        (view === 'login' ? 'Login' : 
                        (view === 'signup' ? 'Sign Up' : 
                        (forgotPasswordStage === 'email' ? 'Send OTP' : 
                        (forgotPasswordStage === 'otp' ? 'Verify OTP' : 'Reset Password'))))}
                </button>
                
                 {view === 'login' && (
                    <p className="forgot-password-link">
                        <button type="button" onClick={() => handleViewChange('forgotPassword')}>Forgot password?</button>
                    </p>
                )}
                
                <p className="form-switch">
                    {view === 'login' ? "Don't have an account?" : 'Already have an account?'}
                    <button type="button" onClick={() => handleViewChange(view !== 'login' ? 'login' : 'signup')}>
                        {view !== 'login' ? 'Login' : 'Sign Up'}
                    </button>
                </p>
            </form>
        </div>
    </div>
  );
};

export default Login;
