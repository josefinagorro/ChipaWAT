import { useMemo, useState, type FormEvent } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Home,
  ListChecks,
  ShoppingBasket,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  additionalExpenseExample,
  currencyFormatter,
  getHousemateName,
  groceryPurchases,
  housemates,
  type Expense,
} from "./features/expenses/expenseData";

const reminders = [
  { title: "Gastos", detail: "Deudas, pagos y compras compartidas", tone: "rose" },
  { title: "Calendario", detail: "Planes, vencimientos y eventos de la casa", tone: "mint" },
  { title: "Notificaciones", detail: "Avisos para no colgarse con nada", tone: "lilac" },
];

const featureIdeas = [
  "Perfil personal para cada integrante",
  "Lista de super y compras de la casa",
  "Turnos o tareas de convivencia",
  "Resumen de a quien le debo y quien me debe",
];

export function App() {
  const [superPurchases, setSuperPurchases] = useState<Expense[]>(groceryPurchases);
  const [additionalExpenses, setAdditionalExpenses] = useState<Expense[]>([
    additionalExpenseExample,
  ]);
  const [showSuperForm, setShowSuperForm] = useState(false);
  const [showAdditionalForm, setShowAdditionalForm] = useState(false);
  const [superTitle, setSuperTitle] = useState("Compra de super");
  const [superDate, setSuperDate] = useState("2026-09-06");
  const [superAmount, setSuperAmount] = useState(0);
  const [superPayer, setSuperPayer] = useState("gorro");
  const [superParticipants, setSuperParticipants] = useState(
    housemates.map((housemate) => housemate.id),
  );
  const [rentPayer, setRentPayer] = useState("gorro");
  const [rentAmount, setRentAmount] = useState(2100000);
  const [additionalDescription, setAdditionalDescription] = useState("");
  const [additionalDate, setAdditionalDate] = useState("2026-09-06");
  const [additionalAmount, setAdditionalAmount] = useState(0);
  const [additionalPayer, setAdditionalPayer] = useState("gorro");
  const [additionalParticipants, setAdditionalParticipants] = useState(
    housemates.map((housemate) => housemate.id),
  );

  const rentShare = rentAmount / housemates.length;
  const additionalShare = useMemo(() => {
    if (additionalParticipants.length === 0) {
      return 0;
    }

    return additionalAmount / additionalParticipants.length;
  }, [additionalAmount, additionalParticipants.length]);
  const superShare = useMemo(() => {
    if (superParticipants.length === 0) {
      return 0;
    }

    return superAmount / superParticipants.length;
  }, [superAmount, superParticipants.length]);

  const toggleSuperParticipant = (housemateId: string) => {
    setSuperParticipants((currentParticipants) => {
      if (currentParticipants.includes(housemateId)) {
        return currentParticipants.filter((participant) => participant !== housemateId);
      }

      return [...currentParticipants, housemateId];
    });
  };

  const toggleAdditionalParticipant = (housemateId: string) => {
    setAdditionalParticipants((currentParticipants) => {
      if (currentParticipants.includes(housemateId)) {
        return currentParticipants.filter((participant) => participant !== housemateId);
      }

      return [...currentParticipants, housemateId];
    });
  };

  const handleAddSuperPurchase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!superTitle.trim() || superAmount <= 0 || superParticipants.length === 0) {
      return;
    }

    setSuperPurchases((currentPurchases) => [
      {
        id: `super-${Date.now()}`,
        title: superTitle.trim(),
        amount: superAmount,
        category: "groceries",
        kind: "group",
        paidBy: superPayer,
        participants: superParticipants,
        date: superDate,
      },
      ...currentPurchases,
    ]);
    setSuperTitle("Compra de super");
    setSuperAmount(0);
    setSuperParticipants(housemates.map((housemate) => housemate.id));
    setShowSuperForm(false);
  };

  const handleAddAdditionalExpense = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !additionalDescription.trim() ||
      additionalAmount <= 0 ||
      additionalParticipants.length === 0
    ) {
      return;
    }

    setAdditionalExpenses((currentExpenses) => [
      {
        id: `additional-${Date.now()}`,
        title: additionalDescription.trim(),
        amount: additionalAmount,
        category: "outing",
        kind: "group",
        paidBy: additionalPayer,
        participants: additionalParticipants,
        date: additionalDate,
      },
      ...currentExpenses,
    ]);
    setAdditionalDescription("");
    setAdditionalAmount(0);
    setAdditionalParticipants(housemates.map((housemate) => housemate.id));
    setShowAdditionalForm(false);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={20} />
          </div>
          <div>
            <p>ChipaWAT</p>
            <span>Casa compartida</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Secciones principales">
          <a className="nav-item active" href="#home">
            <Home size={18} />
            Inicio
          </a>
          <a className="nav-item" href="#gastos">
            <CircleDollarSign size={18} />
            Gastos
          </a>
          <a className="nav-item" href="#calendario">
            <CalendarDays size={18} />
            Calendario
          </a>
          <a className="nav-item" href="#tareas">
            <ListChecks size={18} />
            Tareas
          </a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Panel de convivencia</span>
            <h1>Hola, Gorro</h1>
          </div>
            <button className="icon-button" aria-label="Ver notificaciones">
            <Bell size={20} />
            <span className="notification-dot" />
          </button>
        </header>

        <section className="hero-panel" id="home">
          <div className="hero-copy">
            <span className="soft-pill">Work & Travel 2026</span>
            <h2>Todo lo de la casa, claro y lindo.</h2>
            <p>
              Primero armamos las secciones importantes. Despues este inicio se
              convierte en el resumen real de lo que pase en la casa.
            </p>
          </div>
          <div className="house-card" aria-label="Integrantes de la casa">
            <UsersRound size={22} />
            <p>7 integrantes</p>
            <div className="avatars">
              {housemates.map((name, index) => (
                <span key={name.id} title={name.name}>
                  {name.name.slice(0, 1)}
                  <small>{index + 1}</small>
                </span>
              ))}
            </div>
            <div className="member-list">
              {housemates.map((housemate) => (
                <strong key={housemate.id}>{housemate.name}</strong>
              ))}
            </div>
          </div>
        </section>

        <section className="summary-grid" aria-label="Funcionalidades iniciales">
          <article className="summary-card">
            <span>Modulo 01</span>
            <strong>Gastos</strong>
            <p>Registrar pagos, dividir cuentas y calcular deudas.</p>
          </article>
          <article className="summary-card mint">
            <span>Modulo 02</span>
            <strong>Casa</strong>
            <p>Integrantes, datos utiles, tareas y acuerdos.</p>
          </article>
          <article className="summary-card lilac">
            <span>Modulo 03</span>
            <strong>Agenda</strong>
            <p>Calendario, vencimientos, planes y recordatorios.</p>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-heading">
              <h3>Secciones candidatas</h3>
              <Bell size={18} />
            </div>
            <div className="reminder-list">
              {reminders.map((reminder) => (
                <div className={`reminder ${reminder.tone}`} key={reminder.title}>
                  <div>
                    <strong>{reminder.title}</strong>
                    <span>{reminder.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <h3>Ideas para despues</h3>
              <ShoppingBasket size={18} />
            </div>
            <ul className="task-list">
              {featureIdeas.map((idea) => (
                <li key={idea}>
                  <CheckCircle2 size={18} />
                  <span>{idea}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="expenses-section" id="gastos">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Modulo de gastos</span>
              <h2>Gastos de la casa</h2>
              <p>
                La idea es cargar quien pago, quienes participaron y que el
                sistema calcule automaticamente cuanto corresponde pagar.
              </p>
            </div>
          </div>

          <div className="expenses-layout">
            <article className="rent-panel">
              <span>Alquiler</span>
              <div className="form-grid">
                <label>
                  Monto total
                  <input
                    min="0"
                    type="number"
                    value={rentAmount}
                    onChange={(event) => setRentAmount(Number(event.target.value))}
                  />
                </label>
                <label>
                  Lo paga
                  <select
                    value={rentPayer}
                    onChange={(event) => setRentPayer(event.target.value)}
                  >
                    {housemates.map((housemate) => (
                      <option key={housemate.id} value={housemate.id}>
                        {housemate.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rent-result">
                <div>
                  <small>Parte por persona</small>
                  <strong>{currencyFormatter.format(rentShare)}</strong>
                </div>
                <p>
                  Si paga {getHousemateName(rentPayer)}, cada una debe aportar{" "}
                  {currencyFormatter.format(rentShare)}. {getHousemateName(rentPayer)}{" "}
                  ya cubrio su parte.
                </p>
              </div>

              <div className="rent-members">
                {housemates.map((housemate) => (
                  <div className="member-share" key={housemate.id}>
                    <span>{housemate.name}</span>
                    <strong>
                      {housemate.id === rentPayer
                        ? "Paga total"
                        : currencyFormatter.format(rentShare)}
                    </strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <h3>Como se calcula</h3>
                <CircleDollarSign size={18} />
              </div>
              <ul className="calculation-list">
                <li>Se ingresa el monto total del alquiler.</li>
                <li>Se elige quien lo paga realmente.</li>
                <li>El total se divide entre las 7 integrantes.</li>
                <li>El sistema muestra cuanto le corresponde aportar a cada una.</li>
              </ul>
            </article>
          </div>

          <div className="expenses-layout">
            <article className="panel">
              <div className="panel-heading">
                <h3>Compras de super</h3>
                <button
                  className="mini-action"
                  type="button"
                  onClick={() => setShowSuperForm((isVisible) => !isVisible)}
                >
                  {showSuperForm ? "Cerrar" : "Agregar"}
                </button>
              </div>
              {showSuperForm ? (
                <form className="super-form" onSubmit={handleAddSuperPurchase}>
                  <div className="form-grid">
                    <label>
                      Fecha
                      <input
                        type="date"
                        value={superDate}
                        onChange={(event) => setSuperDate(event.target.value)}
                      />
                    </label>
                    <label>
                      Quien pago
                      <select
                        value={superPayer}
                        onChange={(event) => setSuperPayer(event.target.value)}
                      >
                        {housemates.map((housemate) => (
                          <option key={housemate.id} value={housemate.id}>
                            {housemate.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Descripcion
                    <input
                      type="text"
                      value={superTitle}
                      onChange={(event) => setSuperTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    Cuanto se gasto
                    <input
                      min="0"
                      type="number"
                      value={superAmount}
                      onChange={(event) => setSuperAmount(Number(event.target.value))}
                    />
                  </label>
                  <fieldset>
                    <legend>Quienes participaron</legend>
                    <div className="checkbox-grid">
                      {housemates.map((housemate) => (
                        <label key={housemate.id}>
                          <input
                            checked={superParticipants.includes(housemate.id)}
                            type="checkbox"
                            onChange={() => toggleSuperParticipant(housemate.id)}
                          />
                          {housemate.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="calculator-result compact">
                    <span>Vista previa</span>
                    <strong>{currencyFormatter.format(superShare)}</strong>
                    <p>
                      {superParticipants.length === 0
                        ? "Elegis participantes y se calcula la division."
                        : `${superParticipants.length} participan. Le pagan a ${getHousemateName(
                            superPayer,
                          )}.`}
                    </p>
                  </div>
                  <button className="primary-button" type="submit">
                    Guardar compra
                  </button>
                </form>
              ) : null}
              <div className="expense-list">
                {superPurchases.map((expense) => (
                  <div className="purchase-card" key={expense.id}>
                    <div>
                      <strong>{expense.title}</strong>
                      <span>
                        {expense.date} · pago {getHousemateName(expense.paidBy)}
                      </span>
                    </div>
                    <b>{currencyFormatter.format(expense.amount)}</b>
                    <div className="participant-chips">
                      {housemates.map((housemate) => (
                        <span
                          className={
                            expense.participants.includes(housemate.id) ? "selected" : ""
                          }
                          key={housemate.id}
                        >
                          {housemate.name}
                        </span>
                      ))}
                    </div>
                    <small>
                      Se divide entre {expense.participants.length}:{" "}
                      {currencyFormatter.format(expense.amount / expense.participants.length)}{" "}
                      por persona.
                    </small>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <h3>Gastos adicionales</h3>
                <button
                  className="mini-action"
                  type="button"
                  onClick={() => setShowAdditionalForm((isVisible) => !isVisible)}
                >
                  {showAdditionalForm ? "Cerrar" : "Agregar"}
                </button>
              </div>
              {showAdditionalForm ? (
                <form className="calculator-form" onSubmit={handleAddAdditionalExpense}>
                  <label>
                    Fecha
                    <input
                      type="date"
                      value={additionalDate}
                      onChange={(event) => setAdditionalDate(event.target.value)}
                    />
                  </label>
                  <label>
                    Descripcion
                    <input
                      type="text"
                      value={additionalDescription}
                      onChange={(event) => setAdditionalDescription(event.target.value)}
                    />
                  </label>
                  <label>
                    Cuanto salio
                    <input
                      min="0"
                      type="number"
                      value={additionalAmount}
                      onChange={(event) => setAdditionalAmount(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Quien pago
                    <select
                      value={additionalPayer}
                      onChange={(event) => setAdditionalPayer(event.target.value)}
                    >
                      {housemates.map((housemate) => (
                        <option key={housemate.id} value={housemate.id}>
                          {housemate.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <fieldset>
                    <legend>Quienes participan</legend>
                    <div className="checkbox-grid">
                      {housemates.map((housemate) => (
                        <label key={housemate.id}>
                          <input
                            checked={additionalParticipants.includes(housemate.id)}
                            type="checkbox"
                            onChange={() => toggleAdditionalParticipant(housemate.id)}
                          />
                          {housemate.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="calculator-result">
                    <span>{additionalDescription || "Gasto adicional"}</span>
                    <strong>{currencyFormatter.format(additionalShare)}</strong>
                    <p>
                      {additionalParticipants.length === 0
                        ? "Selecciona al menos una participante para calcular."
                        : `${additionalParticipants.length} participan. Le pagan a ${getHousemateName(
                            additionalPayer,
                          )}. Fecha: ${additionalDate}.`}
                    </p>
                  </div>
                  <button className="primary-button" type="submit">
                    Guardar gasto
                  </button>
                </form>
              ) : null}
              <div className="expense-list saved-expenses">
                {additionalExpenses.map((expense) => (
                  <div className="purchase-card" key={expense.id}>
                    <div>
                      <strong>{expense.title}</strong>
                      <span>
                        {expense.date} · pago {getHousemateName(expense.paidBy)}
                      </span>
                    </div>
                    <b>{currencyFormatter.format(expense.amount)}</b>
                    <div className="participant-chips">
                      {housemates.map((housemate) => (
                        <span
                          className={
                            expense.participants.includes(housemate.id) ? "selected" : ""
                          }
                          key={housemate.id}
                        >
                          {housemate.name}
                        </span>
                      ))}
                    </div>
                    <small>
                      Se divide entre {expense.participants.length}:{" "}
                      {currencyFormatter.format(expense.amount / expense.participants.length)}{" "}
                      por persona.
                    </small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
