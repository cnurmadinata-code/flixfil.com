import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Crown, Film, History, X } from 'lucide-react';
import type { Movie, PaymentRecord, UserProfile } from '../types';
import {
  INDONESIAN_DAYS_SHORT,
  INDONESIAN_MONTHS,
  buildMonthCalendarGrid,
  formatJakartaDateShort,
  formatJakartaFullDate,
  formatJakartaTimeWib,
  getAuthoritativeNow,
  getJakartaDateParts,
  syncServerClock,
} from '../utils/jakartaTime';
import { formatRupiah } from '../utils/i18n';

interface CalendarEvent {
  dateKey: string;
  type: 'published' | 'release' | 'premium' | 'payment' | 'watched';
  title: string;
  subtitle: string;
}

interface JakartaClockProps {
  compact?: boolean;
  movies?: Movie[];
  user?: UserProfile | null;
  payments?: PaymentRecord[];
}

export function JakartaClock({ compact = false, movies = [], user = null, payments = [] }: JakartaClockProps) {
  const [now, setNow] = useState<Date>(() => getAuthoritativeNow());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const initialParts = useMemo(() => getJakartaDateParts(now), [now]);
  const [viewYear, setViewYear] = useState(initialParts.year);
  const [viewMonth, setViewMonth] = useState(initialParts.month);
  const [selectedKey, setSelectedKey] = useState(initialParts.isoDateKey);

  useEffect(() => {
    void syncServerClock().then(() => setNow(getAuthoritativeNow()));
    const tick = window.setInterval(() => {
      setNow(getAuthoritativeNow());
    }, 1000);
    const resync = window.setInterval(() => {
      void syncServerClock();
    }, 5 * 60 * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(resync);
    };
  }, []);

  const currentParts = getJakartaDateParts(now);
  const fullDateStr = formatJakartaFullDate(now);
  const timeStr = formatJakartaTimeWib(now);

  // Build authentic calendar events from real database records (zero fake dates)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const addEvent = (evt: CalendarEvent) => {
      const list = map.get(evt.dateKey) || [];
      list.push(evt);
      map.set(evt.dateKey, list);
    };

    for (const m of movies) {
      if (m.publishedAt) {
        const d = new Date(m.publishedAt);
        if (!Number.isNaN(d.getTime())) {
          const key = getJakartaDateParts(d).isoDateKey;
          addEvent({
            dateKey: key,
            type: 'published',
            title: `Masuk FLIXFIL: ${m.title}`,
            subtitle: `${m.category} · ${m.accessTier === 'premium' ? 'Premium' : 'Gratis'}`,
          });
        }
      }
      if (m.originalReleaseDate && /^\d{4}-\d{2}-\d{2}$/.test(m.originalReleaseDate)) {
        addEvent({
          dateKey: m.originalReleaseDate,
          type: 'release',
          title: `Rilis Asli Film: ${m.title}`,
          subtitle: `${m.country} · Tahun ${m.releaseYear}`,
        });
      }
      if (m.userLibrary?.lastWatchedAt) {
        const wd = new Date(m.userLibrary.lastWatchedAt);
        if (!Number.isNaN(wd.getTime())) {
          addEvent({
            dateKey: getJakartaDateParts(wd).isoDateKey,
            type: 'watched',
            title: `Riwayat Tontonan: ${m.title}`,
            subtitle: m.userLibrary.watchStatus === 'completed' ? 'Selesai ditonton' : 'Sedang ditonton',
          });
        }
      }
    }

    if (user?.subscription_expires_at) {
      const exp = new Date(user.subscription_expires_at);
      if (!Number.isNaN(exp.getTime())) {
        addEvent({
          dateKey: getJakartaDateParts(exp).isoDateKey,
          type: 'premium',
          title: 'Batas Masa Aktif Premium',
          subtitle: `Berlaku hingga ${formatJakartaDateShort(exp)}`,
        });
      }
    }

    for (const p of payments) {
      const pDate = new Date(p.paid_at || p.created_at);
      if (!Number.isNaN(pDate.getTime())) {
        addEvent({
          dateKey: getJakartaDateParts(pDate).isoDateKey,
          type: 'payment',
          title: `Transaksi ${p.plan_name}`,
          subtitle: `${formatRupiah(p.amount_idr)} · ${p.status.toUpperCase()}`,
        });
      }
    }

    return map;
  }, [movies, user, payments]);

  const cells = useMemo(() => buildMonthCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedEvents = eventsByDate.get(selectedKey) || [];

  const handleShiftMonth = (delta: number) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setViewYear(currentParts.year);
          setViewMonth(currentParts.month);
          setSelectedKey(currentParts.isoDateKey);
          setCalendarOpen(true);
        }}
        title="Buka Kalender Otomatis FLIXFIL (WIB)"
        className={`group flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#171717]/90 transition hover:border-[#FF163D]/60 text-left ${
          compact ? 'px-3 py-2 text-[11px] w-full' : 'px-4 py-2.5 text-xs'
        }`}
      >
        <Clock className="h-3.5 w-3.5 text-[#FF163D] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-zinc-300 font-medium truncate">{fullDateStr}</p>
          <p className="font-mono-tabular font-bold text-white tracking-wide">{timeStr}</p>
        </div>
        <CalendarDays className="h-4 w-4 text-zinc-400 group-hover:text-[#FF163D] shrink-0" />
      </button>

      {calendarOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#121214] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FF163D]">
                  Kalender &amp; Waktu Resmi Asia/Jakarta (WIB)
                </p>
                <h2 className="mt-1 font-display text-xl font-bold text-white">
                  {fullDateStr} · <span className="font-mono-tabular text-[#FF163D]">{timeStr}</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                aria-label="Tutup kalender"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              {/* Calendar Month Grid */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleShiftMonth(-1)}
                    aria-label="Bulan sebelumnya"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-zinc-300 hover:border-[#FF163D]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-display text-sm font-bold text-white">
                    {INDONESIAN_MONTHS[viewMonth]} {viewYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleShiftMonth(1)}
                    aria-label="Bulan berikutnya"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-zinc-300 hover:border-[#FF163D]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-zinc-400 mb-1.5">
                  {INDONESIAN_DAYS_SHORT.map((d) => (
                    <div key={d} className="py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1 text-xs">
                  {cells.map((cell, idx) => {
                    if (!cell.day || !cell.isoDateKey) {
                      return <div key={`empty_${idx}`} className="h-9" />;
                    }
                    const isToday = cell.isoDateKey === currentParts.isoDateKey;
                    const isSelected = cell.isoDateKey === selectedKey;
                    const dayEvents = eventsByDate.get(cell.isoDateKey) || [];
                    return (
                      <button
                        key={cell.isoDateKey}
                        type="button"
                        onClick={() => setSelectedKey(cell.isoDateKey!)}
                        className={`relative flex h-9 flex-col items-center justify-center rounded-lg font-mono-tabular transition ${
                          isSelected
                            ? 'bg-[#FF163D] text-white font-bold'
                            : isToday
                              ? 'border border-[#FF163D] text-white font-semibold'
                              : 'bg-black/40 text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        <span>{cell.day}</span>
                        {dayEvents.length > 0 && (
                          <span
                            className={`absolute bottom-1 h-1 w-1 rounded-full ${
                              isSelected ? 'bg-white' : 'bg-[#FF163D]'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day Events */}
              <div className="flex flex-col rounded-xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs font-semibold text-zinc-400">
                  Agenda &amp; Catatan Tanggal <span className="text-white font-mono-tabular">{selectedKey}</span>
                </p>

                {selectedEvents.length === 0 ? (
                  <div className="my-auto py-8 text-center text-xs text-zinc-500">
                    Tidak ada agenda film, transaksi, atau masa aktif pada tanggal ini.
                  </div>
                ) : (
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {selectedEvents.map((ev, i) => (
                      <div key={i} className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-[#171717] p-2.5 text-xs">
                        {ev.type === 'premium' || ev.type === 'payment' ? (
                          <Crown className="h-4 w-4 text-[#FF163D] shrink-0 mt-0.5" />
                        ) : ev.type === 'watched' ? (
                          <History className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <Film className="h-4 w-4 text-[#FF163D] shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-white">{ev.title}</p>
                          <p className="text-[11px] text-zinc-400">{ev.subtitle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-auto border-t border-white/10 pt-3 text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>Zona Waktu: WIB (UTC+7)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setViewYear(currentParts.year);
                      setViewMonth(currentParts.month);
                      setSelectedKey(currentParts.isoDateKey);
                    }}
                    className="text-[#FF163D] font-semibold hover:underline"
                  >
                    Ke Hari Ini
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
