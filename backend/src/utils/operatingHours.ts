export interface MobileOrderingSchedule {
  enabled: boolean;
  manualClosed: boolean;
  manualClosedDate?: string; // YYYY-MM-DD
  manualClosedMessage?: string;
  days: string[]; // ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  openTime: string; // '17:00'
  closeTime: string; // '22:00'
}

export interface OrderingStatus {
  isOpen: boolean;
  reason: 'OPEN' | 'MANUAL_CLOSED' | 'DAY_CLOSED' | 'BEFORE_HOURS' | 'AFTER_HOURS' | 'DISABLED';
  message: string;
  closedButtonText: string;
  bannerText: string;
  formattedOpenTime: string;
  formattedCloseTime: string;
  schedule: MobileOrderingSchedule;
}

export const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export const DEFAULT_SCHEDULE: MobileOrderingSchedule = {
  enabled: true,
  manualClosed: false,
  manualClosedDate: '',
  manualClosedMessage: 'We are sorry, we are closed for today',
  days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
  openTime: '17:00',
  closeTime: '22:00',
};

/**
 * Formats HH:mm string into friendly short 12-hour format:
 * "17:00" -> "5 PM"
 * "17:30" -> "5:30 PM"
 * "13:00" -> "1 PM"
 */
export function formatTimeShort(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Formats HH:mm string into standard 12-hour format with minutes:
 * "17:00" -> "5:00 PM"
 */
export function formatTime12Hour(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${(isNaN(m) ? 0 : m).toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Returns the exact UTC Date representing the start of the current business operating day
 * in the business's timezone, taking token_reset_time into account (defaulting to 04:00 AM or 00:00).
 */
export function getLocalStartOfDay(timezone: string = 'Asia/Kolkata', resetTime: string = '04:00'): Date {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  let hour = now.getHours();
  let minute = now.getMinutes();

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const m: Record<string, string> = {};
    for (const p of parts) m[p.type] = p.value;
    year = parseInt(m.year, 10);
    month = parseInt(m.month, 10);
    day = parseInt(m.day, 10);
    hour = parseInt(m.hour, 10);
    minute = parseInt(m.minute, 10);
  } catch {}

  const [resetHStr, resetMStr] = (resetTime || '04:00').split(':');
  const resetH = parseInt(resetHStr, 10) || 0;
  const resetM = parseInt(resetMStr, 10) || 0;

  const nowMinutes = hour * 60 + minute;
  const resetMinutes = resetH * 60 + resetM;

  const d = new Date(Date.UTC(year, month - 1, day));
  if (nowMinutes < resetMinutes) {
    d.setUTCDate(d.getUTCDate() - 1);
  }

  const guess = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), resetH, resetM, 0));
  try {
    const tzParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(guess);
    const tzm: Record<string, string> = {};
    for (const p of tzParts) tzm[p.type] = p.value;
    const diffMinutes = (parseInt(tzm.hour, 10) * 60 + parseInt(tzm.minute, 10)) - (resetH * 60 + resetM);
    return new Date(guess.getTime() - diffMinutes * 60 * 1000);
  } catch {
    return guess;
  }
}

/**
 * Normalizes any existing raw business operating_hours format into MobileOrderingSchedule.
 */
export function normalizeOperatingHours(raw: any): MobileOrderingSchedule {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SCHEDULE };
  }

  // If already matches our structure
  if (Array.isArray(raw.days) || typeof raw.openTime === 'string') {
    const rawDays = Array.isArray(raw.days)
      ? raw.days.map((d: any) => String(d).toUpperCase().slice(0, 3)).filter((d: string) => ALL_DAYS.includes(d as any))
      : DEFAULT_SCHEDULE.days;

    return {
      enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
      manualClosed: Boolean(raw.manualClosed),
      manualClosedDate: raw.manualClosed ? (typeof raw.manualClosedDate === 'string' ? raw.manualClosedDate : '') : '',
      manualClosedMessage: typeof raw.manualClosedMessage === 'string' && raw.manualClosedMessage.trim()
        ? raw.manualClosedMessage.trim()
        : 'We are sorry, we are closed for today',
      days: rawDays.length > 0 ? rawDays : [...DEFAULT_SCHEDULE.days],
      openTime: typeof raw.openTime === 'string' && raw.openTime.includes(':') ? raw.openTime : DEFAULT_SCHEDULE.openTime,
      closeTime: typeof raw.closeTime === 'string' && raw.closeTime.includes(':') ? raw.closeTime : DEFAULT_SCHEDULE.closeTime,
    };
  }

  // If old key-value day format: { monday: { open: '11:00', close: '23:00' }, ... }
  const foundDays: string[] = [];
  let foundOpen = '17:00';
  let foundClose = '22:00';
  for (const day of ALL_DAYS) {
    const dayKey = day.toLowerCase();
    const matchingKey = Object.keys(raw).find((k) => k.toLowerCase().startsWith(dayKey.slice(0, 3)));
    if (matchingKey && raw[matchingKey]) {
      foundDays.push(day);
      if (raw[matchingKey].open) foundOpen = raw[matchingKey].open;
      if (raw[matchingKey].close) foundClose = raw[matchingKey].close;
    }
  }

  return {
    enabled: true,
    manualClosed: Boolean(raw.manualClosed),
    manualClosedDate: raw.manualClosed ? (typeof raw.manualClosedDate === 'string' ? raw.manualClosedDate : '') : '',
    manualClosedMessage: 'We are sorry, we are closed for today',
    days: foundDays.length > 0 ? foundDays : [...DEFAULT_SCHEDULE.days],
    openTime: foundOpen,
    closeTime: foundClose,
  };
}

/**
 * Evaluates whether mobile ordering is open right now, providing UI display strings.
 */
export function evaluateOrderingStatus(
  rawHours: any,
  timezone: string = 'Asia/Kolkata',
  targetDate: Date = new Date()
): OrderingStatus {
  const schedule = normalizeOperatingHours(rawHours);
  const formattedOpen = formatTimeShort(schedule.openTime);
  const formattedClose = formatTimeShort(schedule.closeTime);
  const openTime12 = formatTime12Hour(schedule.openTime);
  const closeTime12 = formatTime12Hour(schedule.closeTime);

  // Timezone breakdown
  let dayOfWeek = 'FRI';
  let hour = 17;
  let minute = 0;
  let todayYmd = '';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Kolkata',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(targetDate);

    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
    dayOfWeek = getPart('weekday').toUpperCase();
    hour = parseInt(getPart('hour'), 10) || 0;
    minute = parseInt(getPart('minute'), 10) || 0;
    todayYmd = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  } catch {
    // Fallback if timezone string is invalid
    const d = new Date(targetDate);
    const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    dayOfWeek = dayMap[d.getDay()];
    hour = d.getHours();
    minute = d.getMinutes();
    todayYmd = d.toISOString().split('T')[0];
  }

  // 1. Check manual closed toggle
  if (schedule.manualClosed) {
    // If a manualClosedDate is recorded and it's strictly before today, reset manualClosed
    if (schedule.manualClosedDate && schedule.manualClosedDate < todayYmd) {
      // date has passed, let schedule proceed normally
      schedule.manualClosed = false;
    } else {
      return {
        isOpen: false,
        reason: 'MANUAL_CLOSED',
        message: schedule.manualClosedMessage || 'We are sorry, we are closed for today',
        closedButtonText: 'Sorry, we are closed today',
        bannerText: 'We are sorry, we are closed for today • Browsing menu only',
        formattedOpenTime: openTime12,
        formattedCloseTime: closeTime12,
        schedule,
      };
    }
  }

  // 2. Check if automated schedule is disabled
  if (!schedule.enabled) {
    return {
      isOpen: true,
      reason: 'OPEN',
      message: 'Mobile ordering is open',
      closedButtonText: '',
      bannerText: 'Mobile ordering is open',
      formattedOpenTime: openTime12,
      formattedCloseTime: closeTime12,
      schedule,
    };
  }

  // 3. Check day of week
  const isOperatingToday = schedule.days.includes(dayOfWeek);
  if (!isOperatingToday) {
    return {
      isOpen: false,
      reason: 'DAY_CLOSED',
      message: 'We are sorry, we are closed for today',
      closedButtonText: 'Sorry, we are closed today',
      bannerText: `We are sorry, we are closed for today • Closed on ${dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase()}s`,
      formattedOpenTime: openTime12,
      formattedCloseTime: closeTime12,
      schedule,
    };
  }

  // 4. Time range check
  const [openH, openM] = schedule.openTime.split(':').map((v) => parseInt(v, 10) || 0);
  const [closeH, closeM] = schedule.closeTime.split(':').map((v) => parseInt(v, 10) || 0);
  const currentMinutes = hour * 60 + minute;
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const isOvernight = closeMinutes < openMinutes;
  let isOpenNow = false;

  if (!isOvernight) {
    isOpenNow = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } else {
    // Overnight window (e.g., 18:00 to 02:00)
    isOpenNow = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }

  if (isOpenNow) {
    return {
      isOpen: true,
      reason: 'OPEN',
      message: `Open until ${formattedClose}`,
      closedButtonText: '',
      bannerText: `Mobile ordering is open until ${formattedClose}`,
      formattedOpenTime: openTime12,
      formattedCloseTime: closeTime12,
      schedule,
    };
  }

  // Before hours
  if (!isOvernight && currentMinutes < openMinutes) {
    return {
      isOpen: false,
      reason: 'BEFORE_HOURS',
      message: `Ordering opens at ${formattedOpen}`,
      closedButtonText: `Ordering opens at ${formattedOpen}`,
      bannerText: `Ordering opens today at ${openTime12} • Feel free to explore the menu and add items to your cart!`,
      formattedOpenTime: openTime12,
      formattedCloseTime: closeTime12,
      schedule,
    };
  }

  if (isOvernight && currentMinutes < openMinutes && currentMinutes >= closeMinutes) {
    return {
      isOpen: false,
      reason: 'BEFORE_HOURS',
      message: `Ordering opens at ${formattedOpen}`,
      closedButtonText: `Ordering opens at ${formattedOpen}`,
      bannerText: `Ordering opens today at ${openTime12} • Feel free to explore the menu and add items to your cart!`,
      formattedOpenTime: openTime12,
      formattedCloseTime: closeTime12,
      schedule,
    };
  }

  // After hours
  return {
    isOpen: false,
    reason: 'AFTER_HOURS',
    message: 'Ordering closed for today',
    closedButtonText: 'Sorry, we are closed today',
    bannerText: 'Ordering is closed for today • We look forward to serving you tomorrow!',
    formattedOpenTime: openTime12,
    formattedCloseTime: closeTime12,
    schedule,
  };
}
