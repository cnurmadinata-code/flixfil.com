import { useEffect, useRef, useState } from 'react';
import { Lock, Mail, Shield, User } from 'lucide-react';
import type { LinkedGoogleAccount } from '../types';
import { FlixfilLogo } from '../components/FlixfilLogo';

interface AuthPagesProps {
  googleClientId: string;
  onSuccess: () => Promise<void>;
  onGoogleAccountLinked?: (account: LinkedGoogleAccount) => void;
  onCancel: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (cfg: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function AuthPages({
  googleClientId,
  onSuccess,
  onGoogleAccountLinked,
  onCancel,
  onNotify,
}: AuthPagesProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [require2fa, setRequire2fa] = useState(false);

  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [busy, setBusy] = useState(false);

  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!googleClientId || mode !== 'login') return;

    let cancelled = false;
    const initGoogle = () => {
      if (cancelled || !googleBtnRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (resp) => {
          if (!resp.credential) return;
          setBusy(true);
          try {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: resp.credential }),
            });
            const data = (await res.json()) as {
              ok?: boolean;
              error?: string;
              account?: {
                id: string;
                username: string;
                email: string;
                displayName: string;
                avatarUrl: string;
              };
            };
            if (!res.ok) {
              onNotify(data.error || 'Login Google gagal.', true);
              return;
            }
            if (data.account && onGoogleAccountLinked) {
              onGoogleAccountLinked({
                ...data.account,
                lastUsedAt: new Date().toISOString(),
              });
            }
            onNotify('Berhasil masuk dengan akun Google.');
            await onSuccess();
          } finally {
            setBusy(false);
          }
        },
      });
      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 340,
        text: 'signin_with',
      });
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const existing = document.getElementById('flixfil-gsi-script');
      if (!existing) {
        const script = document.createElement('script');
        script.id = 'flixfil-gsi-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initGoogle;
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', initGoogle, { once: true });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [googleClientId, mode, onGoogleAccountLinked, onNotify, onSuccess]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, totpCode }),
      });
      const data = (await res.json()) as { ok?: boolean; require2fa?: boolean; error?: string; message?: string };
      if (res.status === 202 && data.require2fa) {
        setRequire2fa(true);
        onNotify(data.message || 'Masukkan kode 2FA 6 digit.');
        return;
      }
      if (!res.ok) {
        onNotify(data.error || 'Login gagal.', true);
        return;
      }
      onNotify('Selamat datang kembali di FLIXFIL.');
      await onSuccess();
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, displayName, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; verificationCodePreview?: string };
      if (!res.ok) {
        onNotify(data.error || 'Registrasi gagal.', true);
        return;
      }
      onNotify(
        data.verificationCodePreview
          ? `Akun terdaftar! Kode verifikasi email Anda: ${data.verificationCodePreview}`
          : 'Akun berhasil didaftarkan.',
      );
      await onSuccess();
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (resetStep === 'request') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = (await res.json()) as { resetCodeDemo?: string; message?: string };
        setResetStep('confirm');
        onNotify(
          data.resetCodeDemo
            ? `Kode reset: ${data.resetCodeDemo} (berlaku 30 menit)`
            : data.message || 'Cek email Anda.',
        );
      } else {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: resetCode, newPassword }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
        if (!res.ok) {
          onNotify(data.error || 'Reset password gagal.', true);
          return;
        }
        onNotify(data.message || 'Password berhasil diperbarui.');
        setMode('login');
        setResetStep('request');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] pt-24 pb-16 px-4 flex items-center justify-center text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171717] p-7 sm:p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <FlixfilLogo size="md" />
          <p className="text-xs tracking-[0.18em] text-zinc-400 uppercase">Your Story. Your Screen.</p>
        </div>

        <div className="flex rounded-xl bg-black/50 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-lg py-2 transition ${mode === 'login' ? 'bg-[#FF163D] text-white' : 'text-zinc-400'}`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded-lg py-2 transition ${mode === 'register' ? 'bg-[#FF163D] text-white' : 'text-zinc-400'}`}
          >
            Daftar Akun
          </button>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Username atau Email</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/60 py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#FF163D] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Kata Sandi</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/60 py-2.5 pl-10 pr-3 text-sm text-white focus:border-[#FF163D] focus:outline-none"
                />
              </div>
            </div>

            {require2fa && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Kode 2FA (6 digit)</label>
                <div className="relative">
                  <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#FF163D]" />
                  <input
                    type="text"
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="000000"
                    className="w-full rounded-xl border border-[#FF163D]/60 bg-black/60 py-2.5 pl-10 pr-3 text-sm text-white font-mono-tabular"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[#FF163D] py-3 text-sm font-semibold text-white hover:bg-[#e01034] disabled:opacity-50"
            >
              {busy ? 'Memproses...' : 'Masuk ke FLIXFIL'}
            </button>

            <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
              <button type="button" onClick={() => setMode('forgot')} className="hover:text-white">
                Lupa kata sandi?
              </button>
              <button
                type="button"
                onClick={() => {
                  setIdentifier('penonton@flixfil.id');
                  setPassword('FlixFilUser123!');
                }}
                className="text-[#FF163D] hover:underline"
              >
                Isi Akun Penonton Demo
              </button>
            </div>

            <div className="border-t border-white/10 pt-4">
              {googleClientId ? (
                <div ref={googleBtnRef} className="flex justify-center" />
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onNotify(
                      'Untuk mengaktifkan login Google OAuth resmi, tambahkan GOOGLE_CLIENT_ID di environment Secrets.',
                      true,
                    )
                  }
                  className="w-full rounded-xl border border-white/15 bg-black/40 py-2.5 text-xs font-semibold text-zinc-200 hover:border-white/35"
                >
                  Masuk dengan Google
                </button>
              )}
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username (huruf kecil/angka)"
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
            />
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nama Tampilan"
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
            />
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email aktif"
                className="w-full rounded-xl border border-white/10 bg-black/60 py-2.5 pl-10 pr-3 text-sm text-white"
              />
            </div>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kata sandi (min. 8 karakter)"
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[#FF163D] py-3 text-sm font-semibold text-white hover:bg-[#e01034]"
            >
              Buat Akun FLIXFIL
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Masukkan email akun Anda"
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
            />
            {resetStep === 'confirm' && (
              <>
                <input
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="Kode reset 6 digit"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white font-mono-tabular"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Password baru (min. 8 karakter)"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                />
              </>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[#FF163D] py-3 text-sm font-semibold text-white"
            >
              {resetStep === 'request' ? 'Kirim Kode Reset' : 'Simpan Password Baru'}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-xs text-zinc-400 hover:text-white"
            >
              Kembali ke halaman masuk
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
        >
          Lanjutkan menjelajah tanpa masuk
        </button>
      </div>
    </div>
  );
}
