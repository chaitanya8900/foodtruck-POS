import { MobileOrderingSchedule, OrderingStatus } from '@/types';

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

export function normalizeOperatingHours(raw: any): MobileOrderingSchedule {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SCHEDULE };
  }

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

  return { ...DEFAULT_SCHEDULE };
}

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
    const d = new Date(targetDate);
    const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    dayOfWeek = dayMap[d.getDay()];
    hour = d.getHours();
    minute = d.getMinutes();
    todayYmd = d.toISOString().split('T')[0];
  }

  // 1. Manual closed check
  if (schedule.manualClosed) {
    if (schedule.manualClosedDate && schedule.manualClosedDate < todayYmd) {
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

  // 2. Automated schedule disabled
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

  // 3. Day of week check
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
