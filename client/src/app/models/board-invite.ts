export interface BoardInvite {
  id: number;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  board: {
    id: number;
    title: string;
    owner?: { id: number; email?: string; displayName?: string };
  };
  inviter: { id: number; email?: string; displayName?: string };
}
