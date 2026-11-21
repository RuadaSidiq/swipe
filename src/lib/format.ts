import { formatInTimeZone } from "date-fns-tz";
export const fmtDate = (d: Date | string | null | undefined, tz: string, f = "MMM d, yyyy · HH:mm") => (d ? formatInTimeZone(new Date(d), tz || "UTC", f) : "—");
export const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
