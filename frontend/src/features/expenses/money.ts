export const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatMoney(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

export function parseMoneyToCents(value: string): number {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round(parsed * 100);
}

export function splitEvenly(totalCents: number, participantCount: number): number[] {
  if (participantCount <= 0) {
    return [];
  }

  const baseShare = Math.floor(totalCents / participantCount);
  const remainder = totalCents % participantCount;

  return Array.from({ length: participantCount }, (_, index) =>
    index < remainder ? baseShare + 1 : baseShare,
  );
}
