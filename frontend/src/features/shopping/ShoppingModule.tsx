import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShoppingBasket,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { currentUserId, groupMembers, groups, users } from "../expenses/mockData";
import type { ExpenseContext, GroupId, UserId } from "../expenses/types";
import { shoppingItems as mockShoppingItems } from "./mockData";
import { getShoppingItemsForContext, getShoppingProgress } from "./shoppingLogic";
import type { ShoppingDraft, ShoppingItem } from "./types";

const defaultGroupId = "casa-tahoe";

type ShellControls = {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
};

function getGroupContext(groupId: GroupId): ExpenseContext {
  return { scope: "group", groupId };
}

function blankDraft(): ShoppingDraft {
  return {
    name: "",
    quantity: "1",
    category: "Super",
    suggestedStore: "",
    notes: "",
  };
}

function userName(userId?: UserId): string {
  return users.find((user) => user.id === userId)?.name ?? "Sin asignar";
}

export function ShoppingModule({ sidebarCollapsed, onSidebarToggle }: ShellControls) {
  const [context, setContext] = useState<ExpenseContext>(getGroupContext(defaultGroupId));
  const [items, setItems] = useState<ShoppingItem[]>(mockShoppingItems);
  const [draft, setDraft] = useState(blankDraft);
  const [showBought, setShowBought] = useState(true);

  const activeGroup = context.scope === "group" ? groups.find((group) => group.id === context.groupId) : undefined;
  const userGroups = groups.filter((group) =>
    groupMembers.some(
      (membership) => membership.groupId === group.id && membership.userId === currentUserId,
    ),
  );
  const contextItems = useMemo(
    () => getShoppingItemsForContext(items, context, currentUserId),
    [context, items],
  );
  const visibleItems = showBought
    ? contextItems
    : contextItems.filter((item) => item.status === "pending");
  const progress = getShoppingProgress(contextItems);

  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft.name.trim()) {
      return;
    }

    const nextItem: ShoppingItem = {
      id: `shopping-${Date.now()}`,
      scope: context.scope,
      ownerUserId: context.scope === "personal" ? currentUserId : undefined,
      groupId: context.scope === "group" ? context.groupId : undefined,
      name: draft.name.trim(),
      quantity: draft.quantity.trim() || "1",
      category: draft.category.trim() || "Super",
      suggestedStore: draft.suggestedStore.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      status: "pending",
      createdByUserId: currentUserId,
      createdAt: new Date().toISOString(),
    };

    setItems((current) => [nextItem, ...current]);
    setDraft(blankDraft());
  };

  const toggleBought = (itemId: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: item.status === "bought" ? "pending" : "bought",
              boughtByUserId: item.status === "bought" ? undefined : currentUserId,
              boughtAt: item.status === "bought" ? undefined : new Date().toISOString(),
            }
          : item,
      ),
    );
  };

  const deleteItem = (itemId: string) => {
    setItems((current) => current.filter((item) => item.id !== itemId));
  };

  return (
    <main className={`app-shell shopping-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShoppingBasket size={20} />
          </div>
          <div>
            <strong>ChipaWAT</strong>
            <span>{context.scope === "personal" ? "Mi super" : activeGroup?.name}</span>
          </div>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={sidebarCollapsed ? "Expandir menu" : "Esconder menu"}
          onClick={onSidebarToggle}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <nav className="nav-list" aria-label="Secciones">
          <a className="nav-item" href="#gastos">
            <CircleDollarSign size={18} />
            Gastos
          </a>
          <a className="nav-item" href="#calendario">
            <CalendarDays size={18} />
            Calendario
          </a>
          <a className="nav-item active" href="#super">
            <ShoppingBasket size={18} />
            Super
          </a>
        </nav>

        <div className="nav-bottom">
          <a className="nav-item" href="#grupos">
            <UsersRound size={18} />
            Grupos
          </a>
          <a className="nav-item" href="#cuenta">
            <UserRound size={18} />
            Cuenta
          </a>
        </div>
      </aside>

      <section className="content" id="super">
        <header className="module-header">
          <div>
            <span className="eyebrow">{context.scope === "personal" ? "Mi lista" : activeGroup?.name}</span>
            <h1>{context.scope === "personal" ? "Super personal" : "Super grupal"}</h1>
            <p>
              {context.scope === "personal"
                ? "Tu lista privada para compras personales."
                : "Lista compartida de la casa, con quién cargó cada cosa y dónde conviene comprarla."}
            </p>
          </div>
        </header>

        <section className="calendar-context-tabs expense-context-tabs" aria-label="Contexto de super">
          <button
            className={context.scope === "personal" ? "active" : ""}
            type="button"
            onClick={() => setContext({ scope: "personal", ownerUserId: currentUserId })}
          >
            <UserRound size={18} />
            Personal
          </button>
          <button
            className={context.scope === "group" ? "active" : ""}
            type="button"
            onClick={() => setContext(getGroupContext(activeGroup?.id ?? defaultGroupId))}
          >
            <UsersRound size={18} />
            Grupo
          </button>
          <label className="group-select">
            Grupo activo
            <select
              disabled={context.scope !== "group"}
              value={context.scope === "group" ? context.groupId : activeGroup?.id ?? defaultGroupId}
              onChange={(event) => setContext(getGroupContext(event.target.value))}
            >
              {userGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="shopping-layout">
          <article className="panel shopping-form-panel">
            <div className="panel-title">
              <h2>Agregar item</h2>
              <Plus size={18} />
            </div>
            <form className="shopping-form" onSubmit={addItem}>
              <label>
                Producto
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Leche, huevos, shampoo..."
                />
              </label>
              <div className="form-grid">
                <label>
                  Cantidad
                  <input
                    value={draft.quantity}
                    onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))}
                    placeholder="2 packs"
                  />
                </label>
                <label>
                  Categoria
                  <input
                    value={draft.category}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                    placeholder="Casa, comida, higiene..."
                  />
                </label>
              </div>
              <label>
                Dónde conviene comprarlo
                <input
                  value={draft.suggestedStore}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, suggestedStore: event.target.value }))
                  }
                  placeholder="Costco, Safeway, Target..."
                />
              </label>
              <label>
                Nota
                <input
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Marca, tamaño, preferencia..."
                />
              </label>
              <button className="primary-button" type="submit">
                <Plus size={18} />
                Cargar item
              </button>
            </form>
          </article>

          <article className="panel shopping-progress-panel">
            <div className="panel-title">
              <h2>Progreso</h2>
              <CheckCircle2 size={18} />
            </div>
            <strong className="shopping-progress-number">{progress.percentage}%</strong>
            <p>
              {progress.bought} comprados · {progress.pending} pendientes
            </p>
            <div className="progress-track">
              <span style={{ width: `${progress.percentage}%` }} />
            </div>
            <label className="toggle-row">
              <input
                checked={showBought}
                type="checkbox"
                onChange={(event) => setShowBought(event.target.checked)}
              />
              Mostrar comprados
            </label>
          </article>
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>{context.scope === "personal" ? "Mi lista pendiente" : "Lista de la casa"}</h2>
            <ShoppingBasket size={18} />
          </div>
          <div className="shopping-list">
            {visibleItems.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={22} />
                <strong>Lista al día</strong>
                <span>No hay items pendientes en este contexto.</span>
              </div>
            ) : (
              visibleItems.map((item) => (
                <ShoppingItemCard
                  item={item}
                  key={item.id}
                  onDelete={() => deleteItem(item.id)}
                  onToggle={() => toggleBought(item.id)}
                />
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function ShoppingItemCard({
  item,
  onDelete,
  onToggle,
}: {
  item: ShoppingItem;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <article className={`shopping-item ${item.status}`}>
      <button className="shopping-check" type="button" onClick={onToggle} aria-label="Marcar comprado">
        {item.status === "bought" ? <CheckCircle2 size={20} /> : null}
      </button>
      <div>
        <div className="activity-title">
          <span className="category-pill">{item.category}</span>
          {item.suggestedStore ? <span className="store-badge">{item.suggestedStore}</span> : null}
        </div>
        <h3>{item.name}</h3>
        <p>{item.quantity}</p>
        <small>
          {item.scope === "group" ? `Lo cargó ${userName(item.createdByUserId)}` : "Item personal"}
          {item.boughtByUserId ? ` · comprado por ${userName(item.boughtByUserId)}` : ""}
        </small>
        {item.notes ? <small>{item.notes}</small> : null}
      </div>
      <button className="icon-button muted danger" type="button" onClick={onDelete} aria-label="Eliminar item">
        <Trash2 size={16} />
      </button>
    </article>
  );
}
