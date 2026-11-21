import { endOfDay, startOfDay, subDays } from "date-fns";
export function parseRange(sp: { range?: string; from?: string; to?: string }) {
  const to = sp.to ? endOfDay(new Date(sp.to)) : endOfDay(new Date());
  const days = Number(sp.range ?? 30) || 30;
  const from = sp.from ? startOfDay(new Date(sp.from)) : startOfDay(subDays(to, days - 1));
  return { from, to };
}
