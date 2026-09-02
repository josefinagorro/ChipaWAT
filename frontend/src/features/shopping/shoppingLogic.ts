import type { ShoppingItem } from "./types";

// El filtro por contexto (personal vs. grupo activo) ya lo hace la consulta
// a Supabase (cada API trae solo lo que corresponde); acá queda solo el
// orden: pendientes primero, y entre pendientes/comprados, lo más nuevo arriba.
export function sortShoppingItems(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((first, second) => {
    if (first.status !== second.status) {
      return first.status === "pending" ? -1 : 1;
    }

    return second.createdAt.localeCompare(first.createdAt);
  });
}

export function getShoppingProgress(items: ShoppingItem[]): {
  bought: number;
  pending: number;
  total: number;
  percentage: number;
} {
  const total = items.length;
  const bought = items.filter((item) => item.status === "bought").length;
  const pending = total - bought;

  return {
    bought,
    pending,
    total,
    percentage: total === 0 ? 0 : Math.round((bought / total) * 100),
  };
}
