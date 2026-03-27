import { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    setError(null);
    try {
      await login(credentialResponse.credential);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon">♔</div>
        <h1 className="login-title">Chess Trainer</h1>
        <p className="login-subtitle">
          Sign in to save your puzzle progress,<br />
          track SRS reviews, and sync across devices.
        </p>

        {error && <div className="login-error">{error}</div>}

        {loading ? (
          <div className="login-loading">Signing in…</div>
        ) : (
          <div className="login-google-btn">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError('Google login failed. Please try again.')}
              theme="filled_black"
              shape="pill"
              size="large"
              text="signin_with"
            />
          </div>
        )}
      </div>
    </div>
  );
}
