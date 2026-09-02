import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShoppingBasket,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { listMyGroups } from "../groups/groupsApi";
import type { MyGroup } from "../groups/types";
import type { ExpenseContext, User, UserId } from "../expenses/types";
import {
  createGroupShoppingItem,
  deleteGroupShoppingItem,
  listGroupShoppingItems,
  setGroupShoppingItemStatus,
} from "./groupShoppingApi";
import {
  createPersonalShoppingItem,
  deletePersonalShoppingItem,
  listPersonalShoppingItems,
  setPersonalShoppingItemStatus,
} from "./personalShoppingApi";
import { getShoppingProgress, sortShoppingItems } from "./shoppingLogic";
import type { ShoppingDraft, ShoppingItem } from "./types";

type ShellControls = {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
};

const errorBoxStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 10,
  color: "#9a2b3f",
  background: "#fde3e7",
  fontSize: 13,
};

function getGroupContext(groupId: string): ExpenseContext {
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

function userName(directory: User[], userId?: UserId): string {
  return directory.find((user) => user.id === userId)?.name ?? "Sin asignar";
}

export function ShoppingModule({ sidebarCollapsed, onSidebarToggle }: ShellControls) {
  const { profile, user } = useAuth();
  const currentUserId = user?.id ?? "";

  const [context, setContext] = useState<ExpenseContext>({ scope: "personal", ownerUserId: "" });
  const [draft, setDraft] = useState(blankDraft);
  const [showBought, setShowBought] = useState(true);

  // Nada de esto sale de un archivo mock: grupos e items vienen de Supabase,
  // y las policies se encargan de que cada una vea lo suyo.
  const [personalItems, setPersonalItems] = useState<ShoppingItem[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [personalError, setPersonalError] = useState<string | null>(null);

  const reloadPersonalItems = useCallback(async () => {
    setPersonalError(null);

    try {
      setPersonalItems(await listPersonalShoppingItems());
    } catch (caughtError) {
      setPersonalError(
        caughtError instanceof Error ? caughtError.message : "No pudimos cargar tu lista personal.",
      );
    } finally {
      setPersonalLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadPersonalItems();
  }, [reloadPersonalItems]);

  const [myGroups, setMyGroups] = useState<MyGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const reloadGroups = useCallback(async () => {
    if (!currentUserId) {
      return;
    }

    try {
      const nextGroups = await listMyGroups(currentUserId);
      setMyGroups(nextGroups);

      // Si el grupo que estabas mirando ya no existe (o recien entras), cae al primero.
      setContext((current) =>
        current.scope === "group" && !nextGroups.some((group) => group.id === current.groupId)
          ? getGroupContext(nextGroups[0]?.id ?? "")
          : current,
      );
    } catch (caughtError) {
      setGroupsError(caughtError instanceof Error ? caughtError.message : "No pudimos cargar tus grupos.");
    } finally {
      setGroupsLoaded(true);
    }
  }, [currentUserId]);

  useEffect(() => {
    void reloadGroups();
  }, [reloadGroups]);

  const activeGroupId = context.scope === "group" ? context.groupId : "";
  const activeGroup = myGroups.find((group) => group.id === activeGroupId);

  const [groupItems, setGroupItems] = useState<ShoppingItem[]>([]);
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupError, setGroupError] = useState<string | null>(null);

  const reloadGroupItems = useCallback(async () => {
    if (!activeGroupId) {
      setGroupItems([]);
      setGroupLoading(false);
      return;
    }

    setGroupError(null);

    try {
      setGroupItems(await listGroupShoppingItems(activeGroupId));
    } catch (caughtError) {
      setGroupError(
        caughtError instanceof Error ? caughtError.message : "No pudimos cargar la lista del grupo.",
      );
    } finally {
      setGroupLoading(false);
    }
  }, [activeGroupId]);

  useEffect(() => {
    void reloadGroupItems();
  }, [reloadGroupItems]);

  // Para mostrar "lo cargó..." / "comprado por...": siempre incluye a la
  // propia usuaria, y a las demás integrantes cuando hay un grupo activo.
  const directory = useMemo<User[]>(() => {
    const known = new Map<string, User>();

    if (profile) {
      known.set(profile.id, { id: profile.id, name: profile.name, color: profile.color });
    }

    (activeGroup?.members ?? []).forEach((member) => {
      if (!known.has(member.userId)) {
        known.set(member.userId, { id: member.userId, name: member.name, color: member.color });
      }
    });

    return Array.from(known.values());
  }, [profile, activeGroup]);

  const contextItems = context.scope === "personal" ? personalItems : groupItems;
  const sortedItems = useMemo(() => sortShoppingItems(contextItems), [contextItems]);
  const visibleItems = showBought ? sortedItems : sortedItems.filter((item) => item.status === "pending");
  const progress = getShoppingProgress(sortedItems);

  const bannerError = context.scope === "personal" ? personalError : groupsError ?? groupError;

  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft.name.trim()) {
      return;
    }

    const input = {
      name: draft.name.trim(),
      quantity: draft.quantity.trim() || "1",
      category: draft.category.trim() || "Super",
      suggestedStore: draft.suggestedStore.trim(),
      notes: draft.notes.trim(),
    };

    if (context.scope === "personal") {
      void (async () => {
        setPersonalError(null);

        try {
          await createPersonalShoppingItem(input);
          await reloadPersonalItems();
          setDraft(blankDraft());
        } catch (caughtError) {
          setPersonalError(
            caughtError instanceof Error ? caughtError.message : "No pudimos cargar el item.",
          );
        }
      })();

      return;
    }

    const groupId = context.groupId;

    void (async () => {
      setGroupError(null);

      try {
        await createGroupShoppingItem(groupId, input);
        await reloadGroupItems();
        setDraft(blankDraft());
      } catch (caughtError) {
        setGroupError(caughtError instanceof Error ? caughtError.message : "No pudimos cargar el item.");
      }
    })();
  };

  const toggleBought = (item: ShoppingItem) => {
    const nextStatus = item.status === "bought" ? "pending" : "bought";

    if (item.scope === "personal") {
      void (async () => {
        setPersonalError(null);

        try {
          await setPersonalShoppingItemStatus(item.id, nextStatus);
          await reloadPersonalItems();
        } catch (caughtError) {
          setPersonalError(
            caughtError instanceof Error ? caughtError.message : "No pudimos actualizar el item.",
          );
        }
      })();

      return;
    }

    void (async () => {
      setGroupError(null);

      try {
        await setGroupShoppingItemStatus(item.id, nextStatus, nextStatus === "bought" ? currentUserId : null);
        await reloadGroupItems();
      } catch (caughtError) {
        setGroupError(caughtError instanceof Error ? caughtError.message : "No pudimos actualizar el item.");
      }
    })();
  };

  const deleteItem = (item: ShoppingItem) => {
    if (item.scope === "personal") {
      void (async () => {
        setPersonalError(null);

        try {
          await deletePersonalShoppingItem(item.id);
          await reloadPersonalItems();
        } catch (caughtError) {
          setPersonalError(
            caughtError instanceof Error ? caughtError.message : "No pudimos borrar el item.",
          );
        }
      })();

      return;
    }

    void (async () => {
      setGroupError(null);

      try {
        await deleteGroupShoppingItem(item.id);
        await reloadGroupItems();
      } catch (caughtError) {
        setGroupError(caughtError instanceof Error ? caughtError.message : "No pudimos borrar el item.");
      }
    })();
  };

  const isLoadingList =
    context.scope === "personal" ? personalLoading : !groupsLoaded || groupLoading;

  return (
    <main className={`app-shell shopping-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShoppingBasket size={20} />
          </div>
          <div>
            <strong>ChipaWAT</strong>
            <span>{context.scope === "personal" ? "Mi super" : activeGroup?.name ?? "Sin grupo"}</span>
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
            <span className="eyebrow">{context.scope === "personal" ? "Mi lista" : activeGroup?.name ?? "Grupo activo"}</span>
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
            onClick={() => setContext(getGroupContext(activeGroup?.id ?? myGroups[0]?.id ?? ""))}
          >
            <UsersRound size={18} />
            Grupo
          </button>
          <label className="group-select">
            Grupo activo
            <select
              disabled={context.scope !== "group" || myGroups.length === 0}
              value={context.scope === "group" ? context.groupId : activeGroup?.id ?? myGroups[0]?.id ?? ""}
              onChange={(event) => setContext(getGroupContext(event.target.value))}
            >
              {myGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {bannerError ? <p style={errorBoxStyle}>{bannerError}</p> : null}

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
              <button
                className="primary-button"
                type="submit"
                disabled={context.scope === "group" && (!groupsLoaded || myGroups.length === 0)}
              >
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
            {context.scope === "group" && !groupsLoaded ? (
              <p>Cargando tus grupos...</p>
            ) : context.scope === "group" && myGroups.length === 0 ? (
              <p>
                Todavia no sos parte de ningun grupo. Crea uno desde Grupos, en el menu de la izquierda, o
                pedile el link de invitacion a una amiga.
              </p>
            ) : isLoadingList ? (
              <p>Cargando tu lista...</p>
            ) : visibleItems.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={22} />
                <strong>Lista al día</strong>
                <span>No hay items pendientes en este contexto.</span>
              </div>
            ) : (
              visibleItems.map((item) => (
                <ShoppingItemCard
                  directory={directory}
                  item={item}
                  key={item.id}
                  onDelete={() => deleteItem(item)}
                  onToggle={() => toggleBought(item)}
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
  directory,
  item,
  onDelete,
  onToggle,
}: {
  directory: User[];
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
          {item.scope === "group" ? `Lo cargó ${userName(directory, item.createdByUserId)}` : "Item personal"}
          {item.boughtByUserId ? ` · comprado por ${userName(directory, item.boughtByUserId)}` : ""}
        </small>
        {item.notes ? <small>{item.notes}</small> : null}
      </div>
      <button className="icon-button muted danger" type="button" onClick={onDelete} aria-label="Eliminar item">
        <Trash2 size={16} />
      </button>
    </article>
  );
}
