export const JAKARTA_TZ = 'Asia/Jakarta';

export const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const INDONESIAN_DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

let serverOffsetMs = 0;

export async function syncServerClock(): Promise<number> {
  try {
    const reqStart = Date.now();
    const res = await fetch('/api/time', { cache: 'no-store' });
    const reqEnd = Date.now();
    if (!res.ok) return serverOffsetMs;
    const data = (await res.json()) as { epochMs?: number };
    if (typeof data.epochMs === 'number') {
      const midpoint = (reqStart + reqEnd) / 2;
      serverOffsetMs = data.epochMs - midpoint;
    }
  } catch {
    // Keep existing offset if offline
  }
  return serverOffsetMs;
}

export function getAuthoritativeNow(): Date {
  return new Date(Date.now() + serverOffsetMs);
}

export interface JakartaDateParts {
  year: number;
  month: number; // 0-indexed (0..11)
  day: number; // 1..31
  weekdayIndex: number; // 0=Minggu..6=Sabtu
  hour: string;
  minute: string;
  second: string;
  isoDateKey: string; // YYYY-MM-DD in Asia/Jakarta
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: JAKARTA_TZ,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getJakartaDateParts(date: Date = getAuthoritativeNow()): JakartaDateParts {
  const parts = partsFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const year = Number(map.year || 2026);
  const month = Math.max(0, Math.min(11, Number(map.month || 1) - 1));
  const day = Number(map.day || 1);
  // Some locales/runtimes format midnight hour as '24' in hour12:false; normalize to '00'
  const rawHour = map.hour === '24' ? '00' : map.hour || '00';
  const hour = rawHour.padStart(2, '0');
  const minute = (map.minute || '00').padStart(2, '0');
  const second = (map.second || '00').padStart(2, '0');
  const weekdayIndex = WEEKDAY_MAP[map.weekday || 'Sun'] ?? 0;

  const isoDateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, weekdayIndex, hour, minute, second, isoDateKey };
}

export function formatJakartaFullDate(dateInput?: Date | string | null): string {
  const d = dateInput ? new Date(dateInput) : getAuthoritativeNow();
  if (Number.isNaN(d.getTime())) return '-';
  const p = getJakartaDateParts(d);
  return `${INDONESIAN_DAYS[p.weekdayIndex]}, ${p.day} ${INDONESIAN_MONTHS[p.month]} ${p.year}`;
}

export function formatJakartaDateShort(dateInput?: Date | string | null): string {
  const d = dateInput ? new Date(dateInput) : getAuthoritativeNow();
  if (Number.isNaN(d.getTime())) return '-';
  const p = getJakartaDateParts(d);
  return `${p.day} ${INDONESIAN_MONTHS[p.month]} ${p.year}`;
}

export function formatJakartaTimeWib(dateInput?: Date | string | null): string {
  const d = dateInput ? new Date(dateInput) : getAuthoritativeNow();
  if (Number.isNaN(d.getTime())) return '--:--:-- WIB';
  const p = getJakartaDateParts(d);
  return `${p.hour}:${p.minute}:${p.second} WIB`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[monthIndex] ?? 30;
}

export interface CalendarCell {
  day: number | null;
  isoDateKey: string | null;
}

export function buildMonthCalendarGrid(year: number, monthIndex: number): CalendarCell[] {
  const firstDayUtc = new Date(Date.UTC(year, monthIndex, 1, 5, 0, 0)); // 12:00 WIB safely
  const startWeekday = getJakartaDateParts(firstDayUtc).weekdayIndex; // 0=Minggu..6=Sabtu
  const daysInMonth = getDaysInMonth(year, monthIndex);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push({ day: null, isoDateKey: null });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, isoDateKey: key });
  }
  return cells;
}
