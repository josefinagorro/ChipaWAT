import type { HouseMember, RentMonth, SharedExpense } from "./types";

export const currentUserId = "juli";

export const houseMembers: HouseMember[] = [
  { id: "juli", name: "Juli", color: "#c84c7c" },
  { id: "sofi", name: "Sofi", color: "#4a8f74" },
  { id: "matu", name: "Matu", color: "#5969b5" },
  { id: "flor", name: "Flor", color: "#b86d32" },
  { id: "vicky", name: "Vicky", color: "#8170b8" },
];

export const rentMonths: RentMonth[] = [
  {
    id: "rent-december",
    label: "Alquiler diciembre",
    month: "Diciembre",
    totalCents: 300000,
    dueDate: "2025-12-05",
    paidBy: "juli",
    participantIds: houseMembers.map((member) => member.id),
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
    label: "Alquiler enero",
    month: "Enero",
    totalCents: 300000,
    dueDate: "2026-01-05",
    paidBy: "juli",
    participantIds: houseMembers.map((member) => member.id),
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
    label: "Alquiler febrero",
    month: "Febrero",
    totalCents: 300000,
    dueDate: "2026-02-05",
    paidBy: "sofi",
    participantIds: houseMembers.map((member) => member.id),
    payments: {
      juli: "pending",
      sofi: "paid",
      matu: "pending",
      flor: "pending",
      vicky: "pending",
    },
  },
  {
    id: "rent-march",
    label: "Alquiler marzo",
    month: "Marzo",
    totalCents: 300000,
    dueDate: "2026-03-05",
    paidBy: "vicky",
    participantIds: houseMembers.map((member) => member.id),
    payments: {
      juli: "pending",
      sofi: "pending",
      matu: "pending",
      flor: "pending",
      vicky: "paid",
    },
  },
];

export const sharedExpenses: SharedExpense[] = [
  {
    id: "grocery-safeway",
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
    type: "grocery",
    category: "Limpieza",
    description: "Productos para la casa",
    date: "2026-01-14",
    amountCents: 8450,
    paidBy: "flor",
    participantIds: houseMembers.map((member) => member.id),
  },
  {
    id: "other-uber",
    type: "other",
    category: "Uber",
    description: "Uber al centro",
    date: "2026-01-18",
    amountCents: 4000,
    paidBy: "sofi",
    participantIds: ["sofi", "juli", "flor", "vicky"],
  },
  {
    id: "other-ski",
    type: "other",
    category: "Ski",
    description: "Pase grupal de tarde",
    date: "2026-01-20",
    amountCents: 18500,
    paidBy: "vicky",
    participantIds: ["juli", "matu", "vicky"],
  },
];
