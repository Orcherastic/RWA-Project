export interface Board {
  id: number;
  title: string;
  ownerId?: number;
  owner?: { id: number; email?: string; displayName?: string };
  createdAt?: string;
  content?: string;
}
