export type OrderStatus = 'pending' | 'reserved' | 'shipped' | 'cancelled';

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ['reserved', 'cancelled'],
  reserved: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT[from].includes(to);
}
