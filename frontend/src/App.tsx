import { useEffect, useState } from "react";
import { CalendarModule } from "./features/calendar/CalendarModule";
import { ExpenseModuleV2 } from "./features/expenses/ExpenseModuleV2";
import { ShoppingModule } from "./features/shopping/ShoppingModule";

export function App() {
  const [activeSection, setActiveSection] = useState(() =>
    window.location.hash === "#calendario"
      ? "calendar"
      : window.location.hash === "#super"
        ? "shopping"
        : "expenses",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  useEffect(() => {
    const handleHashChange = () => {
      setActiveSection(
        window.location.hash === "#calendario"
          ? "calendar"
          : window.location.hash === "#super"
            ? "shopping"
            : "expenses",
      );
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      localStorage.setItem("sidebar-collapsed", String(!current));
      return !current;
    });
  };

  const sidebarProps = {
    sidebarCollapsed,
    onSidebarToggle: toggleSidebar,
  };

  if (activeSection === "calendar") {
    return <CalendarModule {...sidebarProps} />;
  }

  if (activeSection === "shopping") {
    return <ShoppingModule {...sidebarProps} />;
  }

  return <ExpenseModuleV2 {...sidebarProps} />;
}

