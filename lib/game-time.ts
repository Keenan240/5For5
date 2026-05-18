/** Display label for slate game row (tipoff ET, Final, live status, etc.). */

function formatEtFromDate(date: Date): string {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${time} EST`;
}

/** Parse NBA-style status text like "7:00 pm ET" → "7:00 PM EST". */
function parseTipoffFromStatusText(status: string): string | null {
  const m = status.trim().match(/^(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2];
  const meridiem = m[3].toLowerCase().startsWith("p") ? "PM" : "AM";
  return `${hour}:${minute} ${meridiem} EST`;
}

function isFinalStatus(status: string): boolean {
  return /\bfinal\b/i.test(status);
}

function isLiveStatus(status: string): boolean {
  const s = status.trim();
  if (!s || isFinalStatus(s)) return false;
  if (/^\d{1,2}:\d{2}\s*(a|p)/i.test(s)) return false;
  if (/^(scheduled|pregame|preview)/i.test(s)) return false;
  return true;
}

export function formatGameTimeLabel(opts: {
  datetimeUtc?: string | null;
  statusText?: string;
}): string {
  const status = (opts.statusText ?? "").trim();

  if (status && isFinalStatus(status)) return "Final";
  if (status && isLiveStatus(status)) return status;

  if (opts.datetimeUtc) {
    const d = new Date(opts.datetimeUtc);
    if (!Number.isNaN(d.getTime())) {
      return formatEtFromDate(d);
    }
  }

  if (status) {
    const tipoff = parseTipoffFromStatusText(status);
    if (tipoff) return tipoff;
    if (status.length > 0 && !/^scheduled$/i.test(status)) return status;
  }

  return "TBD";
}
