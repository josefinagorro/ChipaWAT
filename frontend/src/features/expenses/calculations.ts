import { splitEvenly } from "./money";
import type {
  GroupExpense,
  GroupSettlement,
  MemberBalance,
  MemberId,
  RentMonth,
  RentStatus,
  Settlement,
  Transfer,
  User,
} from "./types";

export function getRentShareCents(rent: RentMonth): number {
  return Math.round(rent.totalCents / rent.participantIds.length);
}

export function getRentStatus(rent: RentMonth): RentStatus {
  const paidCount = rent.participantIds.filter(
    (memberId) => rent.payments[memberId] === "paid",
  ).length;

  if (paidCount === 0) {
    return "pending";
  }

  if (paidCount === rent.participantIds.length) {
    return "paid";
  }

  return "partial";
}

export function getRentPaidCents(rent: RentMonth): number {
  const shares = splitEvenly(rent.totalCents, rent.participantIds.length);

  return rent.participantIds.reduce((total, memberId, index) => {
    if (rent.payments[memberId] !== "paid") {
      return total;
    }

    return total + shares[index];
  }, 0);
}

export function buildRentTransfers(rents: RentMonth[]): Transfer[] {
  return rents.flatMap((rent) => {
    const shares = splitEvenly(rent.totalCents, rent.participantIds.length);

    return rent.participantIds.flatMap((memberId, index) => {
      if (memberId === rent.paidBy || rent.payments[memberId] === "paid") {
        return [];
      }

      return {
        from: memberId,
        to: rent.paidBy,
        amountCents: shares[index],
      };
    });
  });
}

export function buildExpenseTransfers(expenses: GroupExpense[]): Transfer[] {
  return expenses.flatMap((expense) => {
    const shares = splitEvenly(expense.amountCents, expense.participantIds.length);

    return expense.participantIds.flatMap((memberId, index) => {
      if (memberId === expense.paidBy) {
        return [];
      }

      return {
        from: memberId,
        to: expense.paidBy,
        amountCents: shares[index],
      };
    });
  });
}

/**
 * Junta todas las deudas sueltas en una sola por par de personas, y compensa
 * las que van en sentidos opuestos: si Ana le debe $300 a Bea y Bea le debe
 * $100 a Ana, queda una sola línea de $200 de Ana a Bea.
 *
 * Esto es lo que hace que una transferencia ya registrada borre la deuda: entra
 * como un movimiento al revés y se cancela contra lo que se debía.
 */
export function mergeTransfers(transfers: Transfer[]): Transfer[] {
  // La clave es el par ordenado (siempre el mismo par da la misma clave, vaya
  // la deuda para donde vaya) y el valor es el neto en la direccion a -> b.
  const netByPair = new Map<string, number>();

  transfers.forEach((transfer) => {
    if (transfer.amountCents <= 0 || transfer.from === transfer.to) {
      return;
    }

    const forward = transfer.from < transfer.to;
    const key = forward
      ? `${transfer.from}|${transfer.to}`
      : `${transfer.to}|${transfer.from}`;
    const signedAmount = forward ? transfer.amountCents : -transfer.amountCents;

    netByPair.set(key, (netByPair.get(key) ?? 0) + signedAmount);
  });

  return Array.from(netByPair.entries())
    .flatMap(([key, netAmount]) => {
      if (netAmount === 0) {
        return [];
      }

      const [first, second] = key.split("|");

      return [
        {
          from: netAmount > 0 ? first : second,
          to: netAmount > 0 ? second : first,
          amountCents: Math.abs(netAmount),
        },
      ];
    })
    .sort((first, second) => second.amountCents - first.amountCents);
}

export function calculateBalances(members: User[], transfers: Transfer[]): MemberBalance[] {
  const balances = new Map<MemberId, number>();

  members.forEach((member) => balances.set(member.id, 0));

  transfers.forEach((transfer) => {
    balances.set(transfer.from, (balances.get(transfer.from) ?? 0) - transfer.amountCents);
    balances.set(transfer.to, (balances.get(transfer.to) ?? 0) + transfer.amountCents);
  });

  return members.map((member) => ({
    memberId: member.id,
    amountCents: balances.get(member.id) ?? 0,
  }));
}

export function simplifyTransfers(balances: MemberBalance[]): Transfer[] {
  const debtors = balances
    .filter((balance) => balance.amountCents < 0)
    .map((balance) => ({ memberId: balance.memberId, amountCents: Math.abs(balance.amountCents) }))
    .sort((first, second) => second.amountCents - first.amountCents);
  const creditors = balances
    .filter((balance) => balance.amountCents > 0)
    .map((balance) => ({ memberId: balance.memberId, amountCents: balance.amountCents }))
    .sort((first, second) => second.amountCents - first.amountCents);
  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.amountCents, creditor.amountCents);

    if (amountCents > 0) {
      transfers.push({
        from: debtor.memberId,
        to: creditor.memberId,
        amountCents,
      });
    }

    debtor.amountCents -= amountCents;
    creditor.amountCents -= amountCents;

    if (debtor.amountCents === 0) {
      debtorIndex += 1;
    }

    if (creditor.amountCents === 0) {
      creditorIndex += 1;
    }
  }

  return transfers;
}

/**
 * Una transferencia ya registrada entra al cálculo como una deuda al revés: si
 * Ana le transfirió $500 a Bea, es como si Bea le debiera $500 a Ana, y eso se
 * cancela contra lo que Ana debía. Cuando las dos cosas se emparejan, la deuda
 * desaparece de la lista de pendientes.
 */
export function buildSettlementTransfers(settlements: GroupSettlement[]): Transfer[] {
  return settlements.map((settlement) => ({
    from: settlement.toUser,
    to: settlement.fromUser,
    amountCents: settlement.amountCents,
  }));
}

export function calculateSettlements(
  members: User[],
  rents: RentMonth[],
  expenses: GroupExpense[],
  settlements: GroupSettlement[],
): {
  directTransfers: Transfer[];
  balances: MemberBalance[];
  simplifiedSettlements: Settlement[];
} {
  const directTransfers = mergeTransfers([
    ...buildRentTransfers(rents),
    ...buildExpenseTransfers(expenses),
    ...buildSettlementTransfers(settlements),
  ]);
  const balances = calculateBalances(members, directTransfers);
  const simplifiedSettlements: Settlement[] = simplifyTransfers(balances).map((transfer) => ({
    ...transfer,
    id: `${transfer.from}-${transfer.to}-${transfer.amountCents}`,
  }));

  return { directTransfers, balances, simplifiedSettlements };
}
