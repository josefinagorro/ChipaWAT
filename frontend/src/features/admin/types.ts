export type GroupRole = "owner" | "admin" | "member";

export type AdminUser = {
  id: string;
  name: string;
  color: string;
  isAdmin: boolean;
  email: string;
  createdAt: string;
};

export type AdminGroup = {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
};

export type AdminMembership = {
  groupId: string;
  userId: string;
  role: GroupRole;
  joinedAt: string;
};
