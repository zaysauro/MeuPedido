/** Shared presentation only: authorization and recipients are decided on the server. */
export type OperationalNotification = {
  id: string;
  event_type: string;
  entity_id: string | null;
  created_at: Date | string;
  read_at: Date | string | null;
  order_number?: number | string | null;
  table_label?: string | null;
};
export type OperationalVersion = { version: string };
export type NotificationPreferences = { sound_enabled: boolean; push_enabled: boolean };

export function eventMessage(type: string): string {
  const messages: Record<string, string> = {
    'order.created': 'Novo pedido recebido',
    'order.items_added': 'Novos itens adicionados à comanda',
    'order.cancelled': 'Pedido cancelado',
    'order.status_changed': 'Atendimento atualizado',
    'kitchen.order_received': 'Novo pedido na cozinha',
    'kitchen.preparation_started': 'Preparo iniciado',
    'kitchen.order_ready': 'Pedido pronto para servir',
    'order.delivered': 'Pedido entregue',
    'table.opened': 'Mesa aberta',
    'table.updated': 'Mesa atualizada',
    'table.closed': 'Mesa liberada',
    'payment.confirmed': 'Pagamento confirmado',
    'cash_register.updated': 'Caixa atualizado',
  };
  return messages[type] || 'Operação atualizada';
}

export function notificationTone(type: string): 'new' | 'ready' | null {
  if (type === 'kitchen.order_ready') return 'ready';
  if (['order.created', 'order.items_added', 'kitchen.order_received'].includes(type)) return 'new';
  return null;
}

export function notificationLabel(row: OperationalNotification): string {
  return eventMessage(row.event_type) + (row.order_number ? ` · #${row.order_number}` : '') + (row.table_label ? ` · ${row.table_label}` : '');
}

/** A stable event ID is also the deduplication key after a reconnect. */
export function unseenNotifications(rows: readonly OperationalNotification[], seen: Set<string>): OperationalNotification[] {
  const fresh = rows.filter(row => !seen.has(row.id));
  for (const row of rows) seen.add(row.id);
  // Keep memory bounded; current snapshots retain at most 100 notifications.
  if (seen.size > 1000) {
    const recent = Array.from(seen).slice(-500);
    seen.clear();
    for (const id of recent) seen.add(id);
  }
  return fresh;
}
