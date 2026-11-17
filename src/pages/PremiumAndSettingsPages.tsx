import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CreditCard,
  Crown,
  Download,
  EyeOff,
  Globe,
  KeyRound,
  Laptop,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sliders,
  Sun,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  X,
  ZoomIn,
} from 'lucide-react';
import type {
  AdminSubTab,
  LanguageCode,
  LinkedGoogleAccount,
  PaymentRecord,
  SessionInfo,
  SubscriptionPlan,
  UserProfile,
  UserSettings,
  WebsiteConfig,
} from '../types';
import { formatRupiah } from '../utils/i18n';
import { formatJakartaDateShort } from '../utils/jakartaTime';

// ==========================================
// PREMIUM PAGE + DANA QR + MULTI-GATEWAY
// ==========================================
interface PremiumPageProps {
  user: UserProfile | null;
  plans: SubscriptionPlan[];
  payments: PaymentRecord[];
  danaQrConfigured?: boolean;
  onRequireAuth: () => void;
  onRefreshAll: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

type PaymentMethodId = 'dana_qr' | 'gopay' | 'qris' | 'bri' | 'bni' | 'bca' | 'mandiri';

const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; sub: string; gateway: 'dana_qr' | 'midtrans' | 'xendit' }> = [
  { id: 'dana_qr', label: 'DANA QR', sub: 'Scan QR Resmi DANA (Verifikasi Admin)', gateway: 'dana_qr' },
  { id: 'gopay', label: 'GoPay', sub: 'E-Wallet Instan (Midtrans)', gateway: 'midtrans' },
  { id: 'qris', label: 'QRIS', sub: 'Semua E-Wallet & Mobile Banking', gateway: 'midtrans' },
  { id: 'bca', label: 'BCA Virtual Account', sub: 'Transfer Bank Otomatis', gateway: 'midtrans' },
  { id: 'bri', label: 'BRI Virtual Account', sub: 'Transfer Bank Otomatis', gateway: 'xendit' },
  { id: 'bni', label: 'BNI Virtual Account', sub: 'Transfer Bank Otomatis', gateway: 'xendit' },
  { id: 'mandiri', label: 'Mandiri VA', sub: 'Transfer Bank Otomatis', gateway: 'xendit' },
];

export function PremiumPage({
  user,
  plans,
  payments,
  danaQrConfigured = false,
  onRequireAuth,
  onRefreshAll,
  onNotify,
}: PremiumPageProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>('dana_qr');
  const [gateway, setGateway] = useState<'midtrans' | 'xendit'>('midtrans');
  const [qrZoomOpen, setQrZoomOpen] = useState(false);

  const [checkoutData, setCheckoutData] = useState<{
    externalRef: string;
    planName: string;
    amountIdr: number;
    provider: string;
    paymentMethod: PaymentMethodId;
    gatewayToken: string;
    liveGatewayConfigured: boolean;
    danaQrConfigured: boolean;
    danaQrUrl: string;
    requiresAdminVerification: boolean;
    reusedPending?: boolean;
  } | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleStartCheckout = async (planId: string) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setProcessing(true);
    try {
      const providerToSend = selectedMethod === 'dana_qr' ? 'dana_qr' : gateway;
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          paymentMethod: selectedMethod,
          provider: providerToSend,
        }),
      });
      const data = (await res.json()) as {
        externalRef?: string;
        planName?: string;
        amountIdr?: number;
        provider?: string;
        paymentMethod?: PaymentMethodId;
        gatewayToken?: string;
        liveGatewayConfigured?: boolean;
        danaQrConfigured?: boolean;
        danaQrUrl?: string;
        requiresAdminVerification?: boolean;
        reusedPending?: boolean;
        error?: string;
      };
      if (!res.ok || !data.externalRef) {
        onNotify(data.error || 'Gagal membuat transaksi.', true);
        return;
      }
      setCheckoutData({
        externalRef: data.externalRef,
        planName: data.planName || '',
        amountIdr: data.amountIdr || 0,
        provider: data.provider || providerToSend,
        paymentMethod: data.paymentMethod || selectedMethod,
        gatewayToken: data.gatewayToken || '',
        liveGatewayConfigured: Boolean(data.liveGatewayConfigured),
        danaQrConfigured: Boolean(data.danaQrConfigured ?? danaQrConfigured),
        danaQrUrl: data.danaQrUrl || (danaQrConfigured ? '/api/payments/dana-qr-image' : ''),
        requiresAdminVerification: Boolean(data.requiresAdminVerification),
        reusedPending: Boolean(data.reusedPending),
      });
      if (data.reusedPending) {
        onNotify('Menampilkan transaksi pending Anda yang masih aktif untuk mencegah duplikasi.');
      }
      await onRefreshAll();
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmGatewayCallback = async () => {
    if (!checkoutData || checkoutData.requiresAdminVerification) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/payments/webhook/${checkoutData.provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalRef: checkoutData.externalRef,
          gatewayToken: checkoutData.gatewayToken,
          status: 'paid',
        }),
      });
      if (res.ok) {
        setCheckoutData(null);
        onNotify('Pembayaran terverifikasi oleh backend! Keanggotaan Premium FLIXFIL aktif.');
        await onRefreshAll();
      } else {
        onNotify('Verifikasi payment gateway gagal.', true);
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] pt-24 pb-16 px-4 sm:px-8 lg:px-12 text-white">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF163D]">
            Upgrade Your Experience.
          </p>
          <h1 className="mt-2 font-display text-3xl sm:text-5xl font-extrabold text-white">
            FLIXFIL PREMIUM
          </h1>
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
            Semua film di FLIXFIL <strong>gratis ditonton hingga 1080p standar</strong>. FLIXFIL Premium membuka kualitas <strong>1080p Premium HD bitrate tinggi</strong> (jika didukung sumber) &amp; pengalaman bebas iklan hingga maksimal Rp20.000 per paket.
          </p>
        </div>

        {/* Payment Method Selector */}
        <section className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-white">Pilih Metode Pembayaran</h2>
              <p className="text-xs text-zinc-400">
                Mendukung QR Code DANA resmi, e-wallet, QRIS, serta Virtual Account bank Indonesia.
              </p>
            </div>
            {selectedMethod !== 'dana_qr' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400">Gateway:</span>
                {(['midtrans', 'xendit'] as const).map((gw) => (
                  <button
                    key={gw}
                    type="button"
                    onClick={() => setGateway(gw)}
                    className={`rounded-lg px-3 py-1.5 font-semibold uppercase transition ${
                      gateway === gw ? 'bg-[#FF163D] text-white' : 'bg-black/50 text-zinc-300'
                    }`}
                  >
                    {gw}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {PAYMENT_METHODS.map((pm) => {
              const active = selectedMethod === pm.id;
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => {
                    setSelectedMethod(pm.id);
                    if (pm.gateway !== 'dana_qr') setGateway(pm.gateway);
                  }}
                  className={`rounded-xl border p-3.5 text-left transition ${
                    active
                      ? 'border-[#FF163D] bg-[#FF163D]/15 shadow-[0_0_14px_-4px_rgba(255,22,61,0.5)]'
                      : 'border-white/10 bg-black/40 hover:border-white/25'
                  }`}
                >
                  <p className="font-semibold text-xs text-white flex items-center gap-1.5">
                    {pm.id === 'dana_qr' ? (
                      <QrCode className="h-3.5 w-3.5 text-[#FF163D]" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5 text-[#FF163D]" />
                    )}
                    {pm.label}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400 leading-snug">{pm.sub}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Plans Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan, idx) => (
            <div
              key={plan.id}
              className={`flex flex-col justify-between rounded-2xl border p-6 ${
                idx === 1
                  ? 'border-[#FF163D] bg-gradient-to-b from-[#23060d] to-[#171717] neon-red-glow'
                  : 'border-white/10 bg-[#171717]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-white">{plan.name}</h2>
                  <Crown className="h-5 w-5 text-[#FF163D]" />
                </div>
                <p className="mt-4 font-mono-tabular text-3xl font-extrabold text-white">
                  {formatRupiah(plan.price_idr)}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Masa aktif {plan.duration_days} hari · Maks. Rp20.000
                </p>
                <p className="mt-3 text-xs text-zinc-300 leading-relaxed">{plan.description}</p>

                <ul className="mt-5 space-y-2 border-t border-white/10 pt-4 text-xs text-zinc-300">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-[#FF163D] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={processing}
                onClick={() => void handleStartCheckout(plan.id)}
                className="mt-6 w-full rounded-xl bg-[#FF163D] py-3 text-xs font-bold text-white hover:bg-[#e01034] disabled:opacity-50"
              >
                Pilih {plan.name}
              </button>
            </div>
          ))}
        </div>

        {/* Active Checkout Panel */}
        {checkoutData && (
          <div className="rounded-2xl border border-[#FF163D]/60 bg-[#171717] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                {checkoutData.requiresAdminVerification ? (
                  <QrCode className="h-5 w-5 text-[#FF163D]" />
                ) : (
                  <CreditCard className="h-5 w-5 text-[#FF163D]" />
                )}
                <span>
                  {checkoutData.requiresAdminVerification
                    ? 'Pembayaran QR Code DANA Resmi'
                    : `Konfirmasi Pembayaran Resmi (${checkoutData.paymentMethod.toUpperCase()} · ${checkoutData.provider.toUpperCase()})`}
                </span>
              </div>
              <span className="rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-1 text-[11px] font-semibold text-amber-300">
                Status: Menunggu Verifikasi
              </span>
            </div>

            <div className="grid gap-3 rounded-xl bg-black/40 p-4 text-xs text-zinc-300 sm:grid-cols-3">
              <p>
                Kode Transaksi:{' '}
                <strong className="font-mono-tabular text-white block mt-0.5 select-all">
                  {checkoutData.externalRef}
                </strong>
              </p>
              <p>
                Paket Dipilih: <strong className="text-white block mt-0.5">{checkoutData.planName}</strong>
              </p>
              <p>
                Nominal Transfer:{' '}
                <strong className="font-mono-tabular text-[#FF163D] text-sm block mt-0.5">
                  {formatRupiah(checkoutData.amountIdr)}
                </strong>
              </p>
            </div>

            {checkoutData.requiresAdminVerification ? (
              <div className="grid gap-6 md:grid-cols-2 items-center">
                <div className="flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-black/60 p-5">
                  {checkoutData.danaQrConfigured && checkoutData.danaQrUrl ? (
                    <>
                      <img
                        src={checkoutData.danaQrUrl}
                        alt="QR Code DANA Resmi FLIXFIL"
                        className="max-h-64 w-auto rounded-xl bg-white p-2 object-contain"
                      />
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQrZoomOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#171717] px-3 py-1.5 text-xs font-medium text-white hover:border-[#FF163D]"
                        >
                          <ZoomIn className="h-3.5 w-3.5 text-[#FF163D]" />
                          Perbesar QR
                        </button>
                        <a
                          href={checkoutData.danaQrUrl}
                          download={`flixfil-dana-qr-${checkoutData.externalRef}.png`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#171717] px-3 py-1.5 text-xs font-medium text-white hover:border-[#FF163D]"
                        >
                          <Download className="h-3.5 w-3.5 text-[#FF163D]" />
                          Simpan QR
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center space-y-2">
                      <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
                      <p className="text-xs font-semibold text-white">
                        QR Code DANA resmi belum diunggah oleh Administrator.
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        Silakan pilih metode pembayaran GoPay, QRIS, atau Virtual Account, atau hubungi Administrator untuk mengunggah QR Code DANA resmi.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                  <h3 className="font-display text-sm font-bold text-white">Langkah Pembayaran DANA QR</h3>
                  <p>1. Buka aplikasi DANA atau QRIS pada ponsel Anda dan pindai QR Code resmi di samping.</p>
                  <p>
                    2. Masukkan nominal pembayaran tepat sebesar{' '}
                    <strong className="font-mono-tabular text-white">{formatRupiah(checkoutData.amountIdr)}</strong> dan sertakan kode referensi{' '}
                    <strong className="font-mono-tabular text-[#FF163D]">{checkoutData.externalRef}</strong> bila tersedia kolom catatan.
                  </p>
                  <p>
                    3. Transaksi tercatat aman dengan status <strong>Menunggu Verifikasi Administrator</strong>. Paket Premium akan aktif otomatis segera setelah Administrator memverifikasi mutasi pembayaran Anda.
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onRefreshAll()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF163D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e01034]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Cek Status Pembayaran
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckoutData(null)}
                      className="rounded-xl border border-white/15 px-4 py-2 text-xs text-zinc-300"
                    >
                      Tutup Panel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-400">
                  {checkoutData.liveGatewayConfigured
                    ? 'Menghubungkan ke callback verifikasi payment gateway resmi.'
                    : 'Mode Sandbox Terverifikasi: aktivasi Premium hanya diproses setelah tanda tangan kriptografi callback gateway diverifikasi oleh server backend.'}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => void handleConfirmGatewayCallback()}
                    className="rounded-xl bg-[#FF163D] px-6 py-2.5 text-xs font-semibold text-white hover:bg-[#e01034]"
                  >
                    Verifikasi &amp; Selesaikan Pembayaran
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutData(null)}
                    className="rounded-xl border border-white/15 px-5 py-2.5 text-xs text-zinc-300"
                  >
                    Batal
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Payment History */}
        {user && payments.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#171717] p-6">
            <h3 className="font-display text-base font-bold mb-3">Riwayat Pembayaran Anda</h3>
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/40 px-4 py-3 text-xs">
                  <div>
                    <span className="font-semibold text-white">{p.plan_name}</span>{' '}
                    <span className="text-zinc-400">({(p.payment_method || p.provider).toUpperCase()})</span>
                    <p className="font-mono-tabular text-[11px] text-zinc-400">
                      {p.external_ref} · {formatJakartaDateShort(p.created_at)}
                    </p>
                  </div>
                  <span
                    className={`font-mono-tabular font-semibold ${
                      p.status === 'paid' ? 'text-emerald-400' : p.status === 'failed' ? 'text-red-400' : 'text-amber-400'
                    }`}
                  >
                    {formatRupiah(p.amount_idr)} ·{' '}
                    {p.status === 'paid' ? 'TERVERIFIKASI' : p.status === 'failed' ? 'DITOLAK' : 'MENUNGGU'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* QR Zoom Lightbox Modal */}
      {qrZoomOpen && checkoutData?.danaQrUrl && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setQrZoomOpen(false)}
        >
          <div
            className="relative max-w-md w-full rounded-2xl border border-white/15 bg-[#171717] p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold text-white">QR Code DANA Resmi FLIXFIL</span>
              <button type="button" onClick={() => setQrZoomOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={checkoutData.danaQrUrl}
              alt="QR Code DANA Resmi FLIXFIL Diperbesar"
              className="mx-auto w-full max-w-xs rounded-xl bg-white p-3 object-contain"
            />
            <p className="font-mono-tabular text-xs text-zinc-300">
              Total: <strong className="text-white">{formatRupiah(checkoutData.amountIdr)}</strong> · Ref:{' '}
              <strong className="text-[#FF163D]">{checkoutData.externalRef}</strong>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ADVANCED SETTINGS & ACCOUNT CENTER
// ==========================================
interface SettingsPageProps {
  user: UserProfile | null;
  settings: UserSettings | null;
  lang: LanguageCode;
  websiteConfig: WebsiteConfig | null;
  linkedGoogleAccounts: LinkedGoogleAccount[];
  onChangeLang: (lang: LanguageCode) => void;
  onRefreshAll: () => Promise<void>;
  onLogout: () => Promise<void>;
  onRequireAuth: () => void;
  onGoogleAccountAdded?: (acc: LinkedGoogleAccount) => void;
  onRemoveLinkedGoogleAccount?: (id: string) => void;
  onNavigateAdmin?: (tab: AdminSubTab) => void;
  onNavigateFavorites?: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

type SettingsTabId = 'account' | 'appearance' | 'playback' | 'notifications' | 'privacy' | 'website';

interface SettingsDraft {
  theme_mode: 'dark' | 'light';
  accent_intensity: number;
  text_scale: 'small' | 'normal' | 'large';
  language: LanguageCode;
  animations_enabled: boolean;
  transitions_enabled: boolean;
  dashboard_density: 'comfortable' | 'compact';
  ui_sounds: boolean;
  auto_quality: boolean;
  default_quality: string;
  auto_subtitle: boolean;
  default_subtitle_lang: string;
  subtitle_font_size: number;
  default_speed: number;
  default_volume: number;
  auto_play: boolean;
  auto_resume: boolean;
  sync_progress: boolean;
  notify_new_films: boolean;
  notify_trending: boolean;
  notify_episodes: boolean;
  notify_subscription: boolean;
  notify_account: boolean;
  notify_security: boolean;
  notify_email: boolean;
  hide_watch_history: boolean;
}

function buildDraftFromSettings(settings: UserSettings | null, lang: LanguageCode): SettingsDraft {
  return {
    theme_mode: settings?.theme_mode === 'light' ? 'light' : 'dark',
    accent_intensity: settings?.accent_intensity ?? 100,
    text_scale: settings?.text_scale || 'normal',
    language: settings?.language === 'en' ? 'en' : lang,
    animations_enabled: settings ? settings.animations_enabled !== 0 : true,
    transitions_enabled: settings ? settings.transitions_enabled !== 0 : true,
    dashboard_density: settings?.dashboard_density === 'compact' ? 'compact' : 'comfortable',
    ui_sounds: settings ? settings.ui_sounds !== 0 : true,
    auto_quality: settings ? settings.auto_quality !== 0 : true,
    default_quality: settings?.default_quality || 'auto',
    auto_subtitle: settings ? settings.auto_subtitle !== 0 : true,
    default_subtitle_lang: settings?.default_subtitle_lang || 'id',
    subtitle_font_size: settings?.subtitle_font_size ?? 18,
    default_speed: settings?.default_speed ?? 1,
    default_volume: settings?.default_volume ?? 0.85,
    auto_play: settings ? settings.auto_play !== 0 : true,
    auto_resume: settings ? settings.auto_resume !== 0 : true,
    sync_progress: settings ? settings.sync_progress !== 0 : true,
    notify_new_films: settings ? settings.notify_new_films !== 0 : true,
    notify_trending: settings ? settings.notify_trending !== 0 : true,
    notify_episodes: settings ? settings.notify_episodes !== 0 : true,
    notify_subscription: settings ? settings.notify_subscription !== 0 : true,
    notify_account: settings ? settings.notify_account !== 0 : true,
    notify_security: settings ? settings.notify_security !== 0 : true,
    notify_email: settings ? settings.notify_email === 1 : false,
    hide_watch_history: settings ? settings.hide_watch_history === 1 : false,
  };
}

export function SettingsPage({
  user,
  settings,
  lang,
  websiteConfig,
  linkedGoogleAccounts,
  onChangeLang,
  onRefreshAll,
  onLogout,
  onRequireAuth,
  onRemoveLinkedGoogleAccount,
  onNavigateAdmin,
  onNavigateFavorites,
  onNotify,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('account');
  const [draft, setDraft] = useState<SettingsDraft>(() => buildDraftFromSettings(settings, lang));
  const [savingSettings, setSavingSettings] = useState(false);

  // Account Form State
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isPublicProfile, setIsPublicProfile] = useState(user ? user.is_profile_public === 1 : false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Verification / 2FA State
  const [emailCode, setEmailCode] = useState('');
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');

  // Sessions & Delete Account Modal
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmSecret, setDeleteConfirmSecret] = useState('');

  useEffect(() => {
    setDraft(buildDraftFromSettings(settings, lang));
  }, [settings, lang]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setUsername(user.username || '');
      setEmail(user.email || '');
      setAvatarUrl(user.avatar_url || '');
      setBio(user.bio || '');
      setIsPublicProfile(user.is_profile_public === 1);
    }
  }, [user]);

  const loadSessions = async () => {
    const res = await fetch('/api/my/sessions');
    if (res.ok) {
      const data = (await res.json()) as { sessions: SessionInfo[] };
      setSessions(data.sessions || []);
    }
  };

  useEffect(() => {
    if (user && activeTab === 'privacy') {
      void loadSessions();
    }
  }, [user, activeTab]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080808] pt-28 px-4 text-center text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#171717] p-8 space-y-4">
          <h1 className="font-display text-2xl font-bold">Pusat Pengaturan FLIXFIL</h1>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => onChangeLang('id')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold ${lang === 'id' ? 'bg-[#FF163D]' : 'bg-black/50'}`}
            >
              Bahasa Indonesia
            </button>
            <button
              type="button"
              onClick={() => onChangeLang('en')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold ${lang === 'en' ? 'bg-[#FF163D]' : 'bg-black/50'}`}
            >
              English
            </button>
          </div>
          <button
            type="button"
            onClick={onRequireAuth}
            className="w-full rounded-xl bg-[#FF163D] py-3 text-xs font-semibold text-white"
          >
            Masuk untuk Pengaturan &amp; Account Center
          </button>
        </div>
      </div>
    );
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/my/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        onChangeLang(draft.language);
        onNotify('Semua perubahan pengaturan berhasil disimpan.');
        await onRefreshAll();
      } else {
        onNotify('Gagal menyimpan pengaturan.', true);
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCancelDraft = () => {
    setDraft(buildDraftFromSettings(settings, lang));
    onNotify('Perubahan yang belum disimpan telah dibatalkan.');
  };

  const handleResetDefault = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/my/settings/reset', { method: 'POST' });
      if (res.ok) {
        onChangeLang('id');
        onNotify('Pengaturan telah dipulihkan ke bawaan default FLIXFIL.');
        await onRefreshAll();
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/my/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        username,
        email,
        avatarUrl,
        bio,
        isProfilePublic: isPublicProfile,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; emailChanged?: boolean; error?: string };
    if (!res.ok) {
      onNotify(data.error || 'Gagal memperbarui akun.', true);
      return;
    }
    onNotify(
      data.emailChanged
        ? 'Profil & email diperbarui. Cek notifikasi untuk kode verifikasi email baru.'
        : 'Informasi akun & profil berhasil diperbarui.',
    );
    await onRefreshAll();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      onNotify('Konfirmasi password baru tidak cocok.', true);
      return;
    }
    const res = await fetch('/api/my/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    if (!res.ok) {
      onNotify(data.error || 'Gagal memperbarui kata sandi.', true);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    onNotify(data.message || 'Kata sandi diperbarui.');
  };

  const handleUnlinkGoogle = async () => {
    const res = await fetch('/api/my/google-link', { method: 'DELETE' });
    if (res.ok) {
      onRemoveLinkedGoogleAccount?.(user.id);
      onNotify('Koneksi akun Google berhasil dilepaskan dari akun FLIXFIL ini.');
      await onRefreshAll();
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/my/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: deleteConfirmSecret,
        confirmUsername: deleteConfirmSecret,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    if (!res.ok) {
      onNotify(data.error || 'Penghapusan akun gagal.', true);
      return;
    }
    setDeleteOpen(false);
    onNotify(data.message || 'Akun berhasil dihapus.');
    await onRefreshAll();
  };

  const handleSetup2FA = async () => {
    const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as { secret: string; otpauthUri: string };
      setTotpSetup(data);
    }
  };

  const handleVerify2FA = async () => {
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: totpCode }),
    });
    if (res.ok) {
      setTotpSetup(null);
      setTotpCode('');
      onNotify('Autentikasi Dua Faktor (2FA) berhasil diaktifkan!');
      await onRefreshAll();
    } else {
      const err = (await res.json()) as { error?: string };
      onNotify(err.error || 'Kode 2FA tidak valid.', true);
    }
  };

  const handleVerifyEmail = async () => {
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: emailCode }),
    });
    if (res.ok) {
      setEmailCode('');
      onNotify('Email akun berhasil diverifikasi!');
      await onRefreshAll();
    } else {
      const err = (await res.json()) as { error?: string };
      onNotify(err.error || 'Kode verifikasi salah.', true);
    }
  };

  const tabs: Array<{ id: SettingsTabId; label: string; icon: typeof User }> = [
    { id: 'account', label: 'A. Akun & Account Center', icon: User },
    { id: 'appearance', label: 'B. Tampilan', icon: Palette },
    { id: 'playback', label: 'C. Pemutaran Film', icon: Play },
    { id: 'notifications', label: 'D. Notifikasi', icon: Bell },
    { id: 'privacy', label: 'E. Privasi & Sesi', icon: Shield },
  ];
  if (user.role === 'admin') {
    tabs.push({ id: 'website', label: 'F. Website (Admin)', icon: Sliders });
  }

  return (
    <div className="min-h-screen bg-[#080808] pt-24 pb-20 px-4 sm:px-8 lg:px-12 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF163D]">
              FLIXFIL SETTINGS CENTER
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold">Pusat Pengaturan &amp; Account Center</h1>
            <p className="mt-1 text-xs text-zinc-400">
              Kelola identitas akun, multi-akun Google, tampilan, pemutaran video, notifikasi, dan privasi perangkat.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#171717] px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:border-[#FF163D] hover:text-white"
          >
            <LogOut className="h-4 w-4 text-[#FF163D]" />
            Keluar Akun
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/10 pb-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                  active
                    ? 'bg-[#FF163D] text-white shadow-[0_0_16px_-4px_rgba(255,22,61,0.5)]'
                    : 'bg-[#171717] text-zinc-300 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* A. AKUN & ACCOUNT CENTER */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            {/* GOOGLE ACCOUNT CENTER */}
            <section className="rounded-2xl border border-[#FF163D]/35 bg-gradient-to-br from-[#171717] to-[#23060d]/70 p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF163D]">
                    ACCOUNT CENTER
                  </p>
                  <h2 className="font-display text-xl font-bold text-white">
                    Pengalih Akun &amp; Koneksi Google
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onNotify('Pilih atau tambahkan akun Google melalui halaman masuk resmi.');
                    onRequireAuth();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FF163D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e01034]"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Tambahkan / Ganti Akun Google
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/50 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#FF163D]/60 bg-[#171717] flex items-center justify-center">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.display_name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-5 w-5 text-[#FF163D]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-white truncate">{user.display_name}</p>
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        <UserCheck className="h-3 w-3" /> AKTIF
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      @{user.username} · {user.email}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {user.google_linked && (
                    <button
                      type="button"
                      onClick={() => void handleUnlinkGoogle()}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:border-red-400 hover:text-red-300"
                    >
                      Hapus Koneksi Google
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onLogout()}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 hover:border-[#FF163D]"
                  >
                    Keluar Akun Saat Ini
                  </button>
                </div>
              </div>

              {linkedGoogleAccounts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-400">
                    Akun Google Tersimpan di Perangkat Ini (Data tiap akun terisolasi di server)
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {linkedGoogleAccounts.map((acc) => {
                      const isActive = acc.email.toLowerCase() === user.email.toLowerCase();
                      return (
                        <div
                          key={acc.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs ${
                            isActive ? 'border-[#FF163D]/60 bg-[#FF163D]/10' : 'border-white/10 bg-black/40'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {acc.avatarUrl ? (
                              <img src={acc.avatarUrl} alt={acc.displayName} referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <User className="h-4 w-4 text-[#FF163D]" />
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-white truncate">{acc.displayName}</p>
                              <p className="text-[11px] text-zinc-400 truncate">{acc.email}</p>
                            </div>
                          </div>
                          {!isActive ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={onRequireAuth}
                                className="rounded-lg bg-[#FF163D] px-2.5 py-1 text-[11px] font-semibold text-white"
                              >
                                Ganti
                              </button>
                              {onRemoveLinkedGoogleAccount && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveLinkedGoogleAccount(acc.id)}
                                  className="rounded-lg border border-white/15 p-1 text-zinc-400 hover:text-red-400"
                                  aria-label="Hapus dari daftar cepat"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-semibold text-[#FF163D] shrink-0">Digunakan</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Profile & Identity Edit */}
            <form onSubmit={handleSaveAccount} className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4">
              <h2 className="font-display text-lg font-bold">Informasi Profil &amp; Identitas Akun</h2>
              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                <label className="space-y-1">
                  <span className="text-zinc-400">Nama Tampilan</span>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Username</span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Email Akun</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">URL Foto Profil</span>
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-white"
                  />
                </label>
              </div>
              <label className="block space-y-1 text-xs">
                <span className="text-zinc-400">Bio Singkat</span>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm text-white"
                />
              </label>
              <button
                type="submit"
                className="rounded-xl bg-[#FF163D] px-6 py-2.5 text-xs font-semibold text-white hover:bg-[#e01034]"
              >
                Simpan Informasi Akun
              </button>
            </form>

            {/* Change Password + Security 2FA */}
            <div className="grid gap-6 lg:grid-cols-2">
              <form onSubmit={handleChangePassword} className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[#FF163D]" />
                  <h2 className="font-display text-base font-bold">Ganti Password Akun</h2>
                </div>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Password Saat Ini"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-xs text-white"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Password Baru (min. 8 karakter)"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-xs text-white"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Ulangi Password Baru"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-xs text-white"
                />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white hover:bg-[#FF163D] transition"
                >
                  Perbarui Password
                </button>
              </form>

              <section className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#FF163D]" />
                  <h2 className="font-display text-base font-bold">Verifikasi &amp; 2FA</h2>
                </div>

                {user.email_verified === 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                    <p className="text-xs text-amber-200">Email belum terverifikasi. Cek notifikasi akun Anda.</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value)}
                        placeholder="6 digit kode"
                        className="flex-1 rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white font-mono-tabular"
                      />
                      <button
                        type="button"
                        onClick={() => void handleVerifyEmail()}
                        className="rounded-lg bg-[#FF163D] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Verifikasi
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-white">Autentikasi Dua Faktor (TOTP 2FA)</p>
                    <p className="text-zinc-400">{user.totp_enabled ? 'Aktif melindungi login' : 'Belum aktif'}</p>
                  </div>
                  {!user.totp_enabled && (
                    <button
                      type="button"
                      onClick={() => void handleSetup2FA()}
                      className="rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 font-semibold text-white hover:border-[#FF163D]"
                    >
                      Aktifkan 2FA
                    </button>
                  )}
                </div>

                {totpSetup && (
                  <div className="rounded-xl border border-white/15 bg-black/50 p-3 space-y-2 text-xs">
                    <p className="font-mono-tabular font-bold text-[#FF163D] select-all">{totpSetup.secret}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="6 digit kode TOTP"
                        className="flex-1 rounded-lg border border-white/15 bg-black px-3 py-1.5 text-white font-mono-tabular"
                      />
                      <button
                        type="button"
                        onClick={() => void handleVerify2FA()}
                        className="rounded-lg bg-[#FF163D] px-3 py-1.5 font-semibold text-white"
                      >
                        Konfirmasi
                      </button>
                    </div>
                  </div>
                )}

                {user.role !== 'admin' && (
                  <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Hapus Akun Permanen</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirmSecret('');
                        setDeleteOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/15"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus Akun
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* B. TAMPILAN */}
        {activeTab === 'appearance' && (
          <section className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-6">
            <h2 className="font-display text-lg font-bold">Tampilan, Tema &amp; Bahasa</h2>

            <div className="grid gap-5 sm:grid-cols-2 text-xs">
              <div>
                <p className="text-zinc-400 mb-2">Mode Warna Website</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, theme_mode: 'dark' }))}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 font-semibold border ${
                      draft.theme_mode === 'dark' ? 'border-[#FF163D] bg-[#FF163D] text-white' : 'border-white/10 bg-black/50 text-zinc-300'
                    }`}
                  >
                    <Moon className="h-3.5 w-3.5" /> Mode Gelap
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, theme_mode: 'light' }))}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 font-semibold border ${
                      draft.theme_mode === 'light' ? 'border-[#FF163D] bg-[#FF163D] text-white' : 'border-white/10 bg-black/50 text-zinc-300'
                    }`}
                  >
                    <Sun className="h-3.5 w-3.5" /> Mode Terang
                  </button>
                </div>
              </div>

              <div>
                <p className="text-zinc-400 mb-2">Bahasa Antarmuka</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, language: 'id' }))}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 font-semibold border ${
                      draft.language === 'id' ? 'border-[#FF163D] bg-[#FF163D] text-white' : 'border-white/10 bg-black/50 text-zinc-300'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" /> Bahasa Indonesia
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, language: 'en' }))}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 font-semibold border ${
                      draft.language === 'en' ? 'border-[#FF163D] bg-[#FF163D] text-white' : 'border-white/10 bg-black/50 text-zinc-300'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" /> English
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-2">
                  Intensitas Aksen Merah Neon ({draft.accent_intensity}%)
                </label>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={draft.accent_intensity}
                  onChange={(e) => setDraft((d) => ({ ...d, accent_intensity: Number(e.target.value) }))}
                  className="w-full accent-[#FF163D]"
                />
              </div>

              <div>
                <p className="text-zinc-400 mb-2">Ukuran Teks Antarmuka</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'small', label: 'Kecil' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'large', label: 'Besar' },
                    ] as const
                  ).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, text_scale: sz.id }))}
                      className={`rounded-xl py-2 font-semibold ${
                        draft.text_scale === sz.id ? 'bg-[#FF163D] text-white' : 'bg-black/50 text-zinc-300'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-zinc-400 mb-2">Kepadatan Tampilan Dashboard</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, dashboard_density: 'comfortable' }))}
                    className={`rounded-xl py-2 font-semibold ${
                      draft.dashboard_density === 'comfortable' ? 'bg-[#FF163D] text-white' : 'bg-black/50 text-zinc-300'
                    }`}
                  >
                    Lega (Nyaman)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, dashboard_density: 'compact' }))}
                    className={`rounded-xl py-2 font-semibold ${
                      draft.dashboard_density === 'compact' ? 'bg-[#FF163D] text-white' : 'bg-black/50 text-zinc-300'
                    }`}
                  >
                    Ringkas (Padat)
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2.5 text-zinc-200">
                  <input
                    type="checkbox"
                    checked={draft.animations_enabled}
                    onChange={(e) => setDraft((d) => ({ ...d, animations_enabled: e.target.checked }))}
                    className="accent-[#FF163D]"
                  />
                  Aktifkan animasi website &amp; indikator slider
                </label>
                <label className="flex items-center gap-2.5 text-zinc-200">
                  <input
                    type="checkbox"
                    checked={draft.transitions_enabled}
                    onChange={(e) => setDraft((d) => ({ ...d, transitions_enabled: e.target.checked }))}
                    className="accent-[#FF163D]"
                  />
                  Aktifkan efek transisi halaman &amp; poster
                </label>
                <label className="flex items-center gap-2.5 text-zinc-200">
                  <input
                    type="checkbox"
                    checked={draft.ui_sounds}
                    onChange={(e) => setDraft((d) => ({ ...d, ui_sounds: e.target.checked }))}
                    className="accent-[#FF163D]"
                  />
                  Aktifkan efek suara UI lembut
                </label>
              </div>
            </div>
          </section>
        )}

        {/* C. PEMUTARAN FILM */}
        {activeTab === 'playback' && (
          <section className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-5 text-xs">
            <h2 className="font-display text-lg font-bold">Pengaturan Pemutaran Video</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-zinc-400">Kualitas Video Default</span>
                <select
                  value={draft.default_quality}
                  onChange={(e) => setDraft((d) => ({ ...d, default_quality: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
                >
                  <option value="auto">Auto (Adaptif)</option>
                  <option value="1080p">1080p Full HD (Standar)</option>
                  <option value="720p">720p HD</option>
                  <option value="480p">480p SD</option>
                  <option value="360p">360p</option>
                  <option value="240p">240p</option>
                  <option value="144p">144p</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-zinc-400">Bahasa Subtitle Utama</span>
                <select
                  value={draft.default_subtitle_lang}
                  onChange={(e) => setDraft((d) => ({ ...d, default_subtitle_lang: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
                >
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                  <option value="off">Nonaktif</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-zinc-400">Ukuran Subtitle ({draft.subtitle_font_size}px)</span>
                <input
                  type="range"
                  min={14}
                  max={28}
                  value={draft.subtitle_font_size}
                  onChange={(e) => setDraft((d) => ({ ...d, subtitle_font_size: Number(e.target.value) }))}
                  className="w-full accent-[#FF163D]"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-zinc-400">Kecepatan Pemutaran Default ({draft.default_speed}x)</span>
                <select
                  value={draft.default_speed}
                  onChange={(e) => setDraft((d) => ({ ...d, default_speed: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white font-mono-tabular"
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <option key={s} value={s}>
                      {s}x
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-zinc-400">Volume Default ({Math.round(draft.default_volume * 100)}%)</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.default_volume}
                  onChange={(e) => setDraft((d) => ({ ...d, default_volume: Number(e.target.value) }))}
                  className="w-full accent-[#FF163D]"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 border-t border-white/10 pt-4 text-zinc-200">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={draft.auto_quality}
                  onChange={(e) => setDraft((d) => ({ ...d, auto_quality: e.target.checked }))}
                  className="accent-[#FF163D]"
                />
                Pilih kualitas video secara otomatis
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={draft.auto_subtitle}
                  onChange={(e) => setDraft((d) => ({ ...d, auto_subtitle: e.target.checked }))}
                  className="accent-[#FF163D]"
                />
                Aktifkan subtitle otomatis saat memutar
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={draft.auto_play}
                  onChange={(e) => setDraft((d) => ({ ...d, auto_play: e.target.checked }))}
                  className="accent-[#FF163D]"
                />
                Putar video otomatis (Auto Play)
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={draft.auto_resume}
                  onChange={(e) => setDraft((d) => ({ ...d, auto_resume: e.target.checked }))}
                  className="accent-[#FF163D]"
                />
                Lanjutkan tontonan otomatis dari posisi terakhir
              </label>
              <label className="flex items-center gap-2.5 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.sync_progress}
                  onChange={(e) => setDraft((d) => ({ ...d, sync_progress: e.target.checked }))}
                  className="accent-[#FF163D]"
                />
                Sinkronisasikan progres tontonan antar perangkat secara otomatis
              </label>
            </div>
          </section>
        )}

        {/* D. NOTIFIKASI */}
        {activeTab === 'notifications' && (
          <section className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4 text-xs">
            <h2 className="font-display text-lg font-bold">Preferensi Notifikasi</h2>
            <div className="grid gap-3 sm:grid-cols-2 text-zinc-200">
              {[
                { key: 'notify_new_films', label: 'Film terbaru yang ditambahkan' },
                { key: 'notify_trending', label: 'Film yang sedang Trending' },
                { key: 'notify_episodes', label: 'Episode serial terbaru' },
                { key: 'notify_subscription', label: 'Informasi & masa aktif Premium' },
                { key: 'notify_account', label: 'Informasi perubahan akun' },
                { key: 'notify_security', label: 'Notifikasi keamanan & login baru' },
                { key: 'notify_email', label: 'Kirim ringkasan notifikasi melalui Email' },
              ].map((item) => {
                const k = item.key as keyof SettingsDraft;
                return (
                  <label
                    key={item.key}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(draft[k])}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.checked }))}
                      className="accent-[#FF163D]"
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        {/* E. PRIVASI & PERANGKAT */}
        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4 text-xs">
              <h2 className="font-display text-lg font-bold">Pengaturan Privasi &amp; Koleksi</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-4">
                  <span>Tampilkan profil sebagai Publik (email selalu tersembunyi)</span>
                  <input
                    type="checkbox"
                    checked={isPublicProfile}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setIsPublicProfile(next);
                      await fetch('/api/my/account', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isProfilePublic: next }),
                      });
                      onNotify(`Profil kini berstatus ${next ? 'Publik' : 'Privat'}.`);
                      await onRefreshAll();
                    }}
                    className="accent-[#FF163D]"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-4">
                  <span className="flex items-center gap-2">
                    <EyeOff className="h-4 w-4 text-[#FF163D]" />
                    Sembunyikan / hentikan pencatatan riwayat tontonan
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.hide_watch_history}
                    onChange={(e) => setDraft((d) => ({ ...d, hide_watch_history: e.target.checked }))}
                    className="accent-[#FF163D]"
                  />
                </label>
              </div>

              {onNavigateFavorites && (
                <button
                  type="button"
                  onClick={onNavigateFavorites}
                  className="rounded-xl border border-white/15 bg-black/50 px-4 py-2 font-semibold text-white hover:border-[#FF163D]"
                >
                  Kelola Daftar Favorit &amp; Koleksi Pribadi
                </button>
              )}
            </section>

            {/* Active Sessions / Connected Devices */}
            <section className="rounded-2xl border border-white/10 bg-[#171717] p-6 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-[#FF163D]" />
                    Perangkat &amp; Sesi Login Aktif
                  </h2>
                  <p className="text-zinc-400">Kelola perangkat yang saat ini masuk menggunakan akun FLIXFIL Anda.</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch('/api/my/sessions/logout-all', { method: 'POST' });
                    if (res.ok) {
                      onNotify('Semua perangkat telah dikeluarkan dari akun Anda.');
                      await onRefreshAll();
                    }
                  }}
                  className="rounded-xl bg-[#FF163D] px-4 py-2 font-semibold text-white hover:bg-[#e01034]"
                >
                  Keluar dari Semua Perangkat
                </button>
              </div>

              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/40 p-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <Monitor className="h-4 w-4 text-[#FF163D] shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">
                          {s.user_agent}{' '}
                          {s.isCurrent && <span className="text-emerald-400 font-bold">(Perangkat Ini)</span>}
                        </p>
                        <p className="font-mono-tabular text-[11px] text-zinc-400">
                          IP: {s.ip || 'Lokal'} · Login {formatJakartaDateShort(s.created_at)}
                        </p>
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/my/sessions/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
                          onNotify('Sesi perangkat dihentikan.');
                          await loadSessions();
                        }}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-zinc-300 hover:border-red-400 hover:text-red-300"
                      >
                        Keluarkan
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* F. PENGATURAN WEBSITE (KHUSUS ADMIN) */}
        {activeTab === 'website' && user.role === 'admin' && (
          <section className="rounded-2xl border border-[#FF163D]/40 bg-[#171717] p-6 space-y-5 text-xs">
            <h2 className="font-display text-lg font-bold text-white">Pengaturan Website (Khusus Administrator)</h2>
            <p className="text-zinc-400">
              Ringkasan konfigurasi sistem FLIXFIL saat ini. Perubahan sistem dilindungi verifikasi password administrator.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-black/40 p-3.5">
                <p className="text-zinc-400">Identitas &amp; Slogan</p>
                <p className="font-semibold text-white mt-1">{websiteConfig?.brand || 'FLIXFIL'} — {websiteConfig?.tagline || 'Your Story. Your Screen.'}</p>
              </div>
              <div className="rounded-xl bg-black/40 p-3.5">
                <p className="text-zinc-400">Mode Maintenance</p>
                <p className="font-semibold text-white mt-1">{websiteConfig?.maintenanceMode ? 'AKTIF' : 'NONAKTIF (Publik Normal)'}</p>
              </div>
              <div className="rounded-xl bg-black/40 p-3.5">
                <p className="text-zinc-400">QR Code DANA Resmi</p>
                <p className="font-semibold text-white mt-1">{websiteConfig?.danaQrConfigured ? 'Terunggah' : 'Belum diunggah'}</p>
              </div>
            </div>
            {onNavigateAdmin && (
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigateAdmin('settings')}
                  className="rounded-xl bg-[#FF163D] px-5 py-2.5 font-semibold text-white hover:bg-[#e01034]"
                >
                  Buka Pengaturan Website Lengkap
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateAdmin('categories')}
                  className="rounded-xl border border-white/15 bg-black/50 px-4 py-2.5 font-semibold text-white hover:border-[#FF163D]"
                >
                  Kelola Kategori Film
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateAdmin('users')}
                  className="rounded-xl border border-white/15 bg-black/50 px-4 py-2.5 font-semibold text-white hover:border-[#FF163D]"
                >
                  Verifikasi Pembayaran DANA QR &amp; Pengguna
                </button>
              </div>
            )}
          </section>
        )}

        {/* Shared Save / Cancel / Reset Bar for Settings Categories B, C, D, E */}
        {['appearance', 'playback', 'notifications', 'privacy'].includes(activeTab) && (
          <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[#121214]/95 px-5 py-3.5 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => void handleResetDefault()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-amber-400 hover:text-amber-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Pulihkan Pengaturan Default
            </button>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleCancelDraft}
                className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
              >
                Batalkan
              </button>
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => void handleSaveSettings()}
                className="rounded-xl bg-[#FF163D] px-6 py-2 text-xs font-bold text-white hover:bg-[#e01034] disabled:opacity-50"
              >
                {savingSettings ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Permanent Account Delete Confirmation Modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleDeleteAccount}
            className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#171717] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-display text-lg font-bold text-white">Hapus Akun FLIXFIL Permanen?</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Seluruh riwayat tontonan, koleksi pribadi, favorit, dan sesi akun <strong className="text-white">@{user.username}</strong> akan dihapus permanen.
            </p>
            <input
              type="password"
              required
              autoFocus
              value={deleteConfirmSecret}
              onChange={(e) => setDeleteConfirmSecret(e.target.value)}
              placeholder={user.google_linked ? 'Masukkan password akun atau ketik username Anda' : 'Masukkan password akun Anda'}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-xl border border-white/15 px-4 py-2 text-xs text-zinc-300"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-xl bg-red-600 px-5 py-2 text-xs font-semibold text-white hover:bg-red-500"
              >
                Hapus Permanen
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
