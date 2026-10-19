/** Display label for slate game row (tipoff ET, Final, live status, etc.). */

function formatEtFromDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Parse tip times from short or ESPN long status strings → "7:00 PM". */
function parseTipoffTime(status: string): string | null {
  const s = status.trim();
  // "7:00 pm ET" / "7:00 PM EST"
  let m = s.match(/^(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i);
  if (m) {
    const hour = Number(m[1]);
    const minute = m[2];
    const meridiem = m[3].toLowerCase().startsWith("p") ? "PM" : "AM";
    return `${hour}:${minute} ${meridiem}`;
  }
  // "Tue, October 20th at 7:00 PM EDT" / "October 20th at 3:00 PM EDT"
  m = s.match(/\bat\s+(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i);
  if (m) {
    const hour = Number(m[1]);
    const minute = m[2];
    const meridiem = m[3].toLowerCase().startsWith("p") ? "PM" : "AM";
    return `${hour}:${minute} ${meridiem}`;
  }
  return null;
}

function isFinalStatus(status: string): boolean {
  return /\bfinal\b/i.test(status);
}

function isLiveClockStatus(status: string): boolean {
  const s = status.trim();
  if (!s || isFinalStatus(s)) return false;
  if (parseTipoffTime(s)) return false;
  if (/^(scheduled|pregame|preview)/i.test(s)) return false;
  // "Q2 3:42", "Halftime", etc.
  if (/^(Q\d|OT|Halftime|Half)/i.test(s)) return true;
  if (/\b(end of|quarter)\b/i.test(s)) return true;
  return false;
}

export function formatGameTimeLabel(opts: {
  datetimeUtc?: string | null;
  statusText?: string;
}): string {
  const status = (opts.statusText ?? "").trim();

  if (status && isFinalStatus(status)) return "Final";
  if (status && isLiveClockStatus(status)) return status;

  if (opts.datetimeUtc) {
    const d = new Date(opts.datetimeUtc);
    if (!Number.isNaN(d.getTime())) {
      return formatEtFromDate(d);
    }
  }

  if (status) {
    const tipoff = parseTipoffTime(status);
    if (tipoff) return tipoff;
  }

  return "TBD";
}
