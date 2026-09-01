import type { ShoppingContext, ShoppingItem } from "./types";
import type { UserId } from "../expenses/types";

export function getShoppingItemsForContext(
  items: ShoppingItem[],
  context: ShoppingContext,
  currentUserId: UserId,
): ShoppingItem[] {
  return items
    .filter((item) => {
      if (context.scope === "personal") {
        return item.scope === "personal" && item.ownerUserId === currentUserId;
      }

      return item.scope === "group" && item.groupId === context.groupId;
    })
    .sort((first, second) => {
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
