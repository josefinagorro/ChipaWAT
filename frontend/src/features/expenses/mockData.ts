import type { Expense, Group, GroupMember, RentMonth, User } from "./types";

export const currentUserId = "juli";

export const users: User[] = [
  { id: "juli", name: "Juli", color: "#f27fb1" },
  { id: "sofi", name: "Sofi", color: "#75c99a" },
  { id: "matu", name: "Matu", color: "#b596e8" },
  { id: "flor", name: "Flor", color: "#f3a7c8" },
  { id: "vicky", name: "Vicky", color: "#91d9b0" },
];

export const groups: Group[] = [
  {
    id: "casa-tahoe",
    name: "Casa Tahoe",
    description: "Casa compartida de invierno",
  },
  {
    id: "viaje-las-vegas",
    name: "Viaje Las Vegas",
    description: "Grupo preparado para aislar gastos por groupId",
  },
];

export const groupMembers: GroupMember[] = [
  { groupId: "casa-tahoe", userId: "juli", role: "owner" },
  { groupId: "casa-tahoe", userId: "sofi", role: "admin" },
  { groupId: "casa-tahoe", userId: "matu", role: "member" },
  { groupId: "casa-tahoe", userId: "flor", role: "member" },
  { groupId: "casa-tahoe", userId: "vicky", role: "member" },
  { groupId: "viaje-las-vegas", userId: "juli", role: "owner" },
  { groupId: "viaje-las-vegas", userId: "sofi", role: "member" },
];

const casaTahoeMemberIds = groupMembers
  .filter((member) => member.groupId === "casa-tahoe")
  .map((member) => member.userId);

export const rentMonths: RentMonth[] = [
  {
    id: "rent-december",
    scope: "group",
    groupId: "casa-tahoe",
    label: "Alquiler diciembre",
    month: "Diciembre",
    totalCents: 300000,
    dueDate: "2025-12-05",
    paidBy: "juli",
    participantIds: casaTahoeMemberIds,
    payments: {
      juli: "paid",
      sofi: "paid",
      matu: "paid",
      flor: "paid",
      vicky: "paid",
    },
  },
  {
    id: "rent-january",
    scope: "group",
    groupId: "casa-tahoe",
    label: "Alquiler enero",
    month: "Enero",
    totalCents: 300000,
    dueDate: "2026-01-05",
    paidBy: "juli",
    participantIds: casaTahoeMemberIds,
    payments: {
      juli: "paid",
      sofi: "paid",
      matu: "pending",
      flor: "pending",
      vicky: "paid",
    },
  },
  {
    id: "rent-february",
    scope: "group",
    groupId: "casa-tahoe",
    label: "Alquiler febrero",
    month: "Febrero",
    totalCents: 300000,
    dueDate: "2026-02-05",
    paidBy: "sofi",
    participantIds: casaTahoeMemberIds,
    payments: {
      juli: "pending",
      sofi: "paid",
      matu: "pending",
      flor: "pending",
      vicky: "pending",
    },
  },
  {
    id: "rent-vegas",
    scope: "group",
    groupId: "viaje-las-vegas",
    label: "Hotel Las Vegas",
    month: "Las Vegas",
    totalCents: 82000,
    dueDate: "2026-02-18",
    paidBy: "juli",
    participantIds: ["juli", "sofi"],
    payments: {
      juli: "paid",
      sofi: "pending",
    },
  },
];

export const expenses: Expense[] = [
  {
    id: "personal-lunch",
    scope: "personal",
    ownerUserId: "juli",
    type: "other",
    category: "Comida",
    description: "Almuerzo sola",
    date: "2026-01-10",
    amountCents: 1800,
  },
  {
    id: "personal-clothes",
    scope: "personal",
    ownerUserId: "juli",
    type: "other",
    category: "Ropa",
    description: "Campera thrift",
    date: "2026-01-13",
    amountCents: 4000,
  },
  {
    id: "personal-ski-pass",
    scope: "personal",
    ownerUserId: "juli",
    type: "other",
    category: "Ski",
    description: "Ski pass personal",
    date: "2026-01-21",
    amountCents: 8000,
  },
  {
    id: "grocery-safeway",
    scope: "group",
    groupId: "casa-tahoe",
    type: "grocery",
    category: "Supermercado",
    description: "Supermercado Safeway",
    date: "2026-01-12",
    amountCents: 12000,
    paidBy: "juli",
    participantIds: ["juli", "sofi", "matu", "flor"],
  },
  {
    id: "grocery-cleaning",
    scope: "group",
    groupId: "casa-tahoe",
    type: "grocery",
    category: "Limpieza",
    description: "Productos para la casa",
    date: "2026-01-14",
    amountCents: 8450,
    paidBy: "flor",
    participantIds: casaTahoeMemberIds,
  },
  {
    id: "other-uber",
    scope: "group",
    groupId: "casa-tahoe",
    type: "other",
    category: "Uber",
    description: "Uber al centro",
    date: "2026-01-18",
    amountCents: 4000,
    paidBy: "sofi",
    participantIds: ["sofi", "juli", "flor", "vicky"],
  },
  {
    id: "other-vegas-dinner",
    scope: "group",
    groupId: "viaje-las-vegas",
    type: "other",
    category: "Cena",
    description: "Cena de llegada",
    date: "2026-02-18",
    amountCents: 9600,
    paidBy: "sofi",
    participantIds: ["juli", "sofi"],
  },
];
