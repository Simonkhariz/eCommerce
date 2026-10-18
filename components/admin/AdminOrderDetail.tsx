'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  AdminOrderDetail as OrderDetail,
  OrderStatus,
  adminConfirmDelivery,
  adminGetOrder,
  adminUpdateOrderStatus,
  errorMessage,
  fieldErrors,
} from '@/lib/admin-api';
import {
  ORDER_TRANSITION_LABELS,
  formatDateTime,
  formatPrice,
  gatewayLabel,
  humanize,
  num,
  orderStatus,
  paymentStatus,
} from '@/lib/admin-format';
import {
  Button,
  DetailList,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Notice,
  Panel,
  StatusPill,
  Table,
  TextArea,
  TextInput,
  redirectIfSignedOut,
  useAdminData,
  useConfirm,
  useToast,
} from '@/components/admin/ui';
import { ShipOrderModal } from '@/components/admin/ShipOrderModal';
import { ManualPaymentModal } from '@/components/admin/ManualPaymentModal';

/** Simple status changes (no extra details needed), with the explanation shown before confirming. */
const STATUS_CHANGE_HELP: Partial<Record<OrderStatus, string>> = {
  processing: 'Use this once you start packing the order. The customer sees "Processing".',
  completed: 'Close the order once delivery is settled. No further changes are expected.',
  returned: 'Use this when the parcel comes back to the store. You can then record a refund if one is due.',
  refund_pending: 'Marks the order as awaiting a refund. Record the refund on the Refunds page once the money is returned.',
};

export function AdminOrderDetail({ orderNumber }: { orderNumber: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: order, setData, loading, error, reload } = useAdminData(() => adminGetOrder(orderNumber), [orderNumber]);

  const [shipOpen, setShipOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<OrderStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const notFound = error && !order && /not found/i.test(error);

  if (loading && !order) return <LoadingState label="Loading order…" />;
  if (notFound) {
    return (
      <EmptyState
        title="Order not found"
        description={`There is no order ${orderNumber}.`}
        action={
          <Link href="/admin/orders" className="text-[13px] font-semibold underline">
            Back to orders
          </Link>
        }
      />
    );
  }
  if (error && !order) return <ErrorState message={error} onRetry={reload} />;
  if (!order) return null;

  const os = orderStatus(order.order_status);
  const ps = paymentStatus(order.payment_status);
  const addr = order.shipping_address_snapshot ?? {};
  const zone = order.shipping_zone_snapshot;
  const transitions = order.allowed_transitions ?? [];
  const canRefund = order.payment_status === 'successful' || order.payment_status === 'partially_refunded';

  const handleError = (err: unknown) => {
    if (redirectIfSignedOut(err)) return;
    toast.error(errorMessage(err));
  };

  const markDelivered = async () => {
    const ok = await confirm({
      title: 'Mark as delivered?',
      message: 'Confirm that the customer has received the parcel.',
      confirmLabel: 'Mark delivered',
    });
    if (!ok) return;
    setBusy(true);
    try {
      setData(await adminConfirmDelivery(order.order_number));
      toast.success('Order marked as delivered.');
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    const paid = canRefund;
    const ok = await confirm({
      title: `Cancel ${order.order_number}?`,
      tone: 'danger',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      message: (
        <>
          <p>The reserved stock goes back on sale and the customer is told the order was cancelled.</p>
          {paid && (
            <p className="mt-2 font-semibold">
              This order has been paid. Cancelling does not return the money: record the refund on the Refunds page after you send it.
            </p>
          )}
        </>
      ),
    });
    if (!ok) return;
    setBusy(true);
    try {
      setData(await adminUpdateOrderStatus(order.order_number, 'cancelled', 'Cancelled by the store.'));
      toast.success('Order cancelled.');
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const runTransition = (status: OrderStatus) => {
    if (status === 'shipped') setShipOpen(true);
    else if (status === 'delivered') markDelivered();
    else if (status === 'cancelled') cancelOrder();
    else setStatusTarget(status);
  };

  const items = order.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/orders" className="inline-flex items-center gap-1 text-xs font-medium text-[#6b7280] hover:text-[#111827]">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All orders
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-[#111827]">{order.order_number}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#6b7280]">
              <StatusPill label={os.label} tone={os.tone} />
              <StatusPill label={`Payment: ${ps.label}`} tone={ps.tone} />
              <span>Placed {formatDateTime(order.created_at)}</span>
              {order.order_status === 'pending_payment' && order.expires_at && <span>· Payment window ends {formatDateTime(order.expires_at)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.order_status === 'pending_payment' && (
              <Button variant="primary" onClick={() => setPaymentOpen(true)} disabled={busy}>
                Record manual payment
              </Button>
            )}
            {transitions.map((t) => (
              <Button
                key={t}
                variant={t === 'cancelled' ? 'danger' : t === 'shipped' || t === 'delivered' ? 'primary' : 'secondary'}
                onClick={() => runTransition(t)}
                disabled={busy}
              >
                {ORDER_TRANSITION_LABELS[t] ?? humanize(t)}
              </Button>
            ))}
            {canRefund && (
              <Link
                href={`/admin/refunds?order=${encodeURIComponent(order.order_number)}`}
                className="inline-flex h-9 items-center rounded-lg border border-[#d1d5db] bg-white px-3.5 text-[13px] font-semibold text-[#1f2937] hover:bg-[#f9fafb]"
              >
                Record a refund
              </Link>
            )}
          </div>
        </div>
      </div>

      {order.requires_attention && (
        <Notice tone="danger">
          <strong>Needs attention.</strong> {order.attention_reason || 'Check the payments on this order.'}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Panel title={`Items (${items.length})`}>
            {items.length === 0 ? (
              <EmptyState title="No items recorded" />
            ) : (
              <Table minWidth={560}>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">SKU</th>
                    <th scope="col" className="text-right">
                      Price
                    </th>
                    <th scope="col" className="text-right">
                      Qty
                    </th>
                    <th scope="col" className="text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const opts = it.variant_options ?? {};
                    const variant = [opts.size, opts.color ?? opts.color_name].filter(Boolean).join(' / ');
                    return (
                      <tr key={it.id}>
                        <td>
                          <span className="block font-medium text-[#111827]">{it.item_name}</span>
                          {variant && <span className="block text-xs text-[#6b7280]">{variant}</span>}
                        </td>
                        <td className="text-xs text-[#4b5563]">{it.sku || '—'}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatPrice(num(it.unit_price))}</td>
                        <td className="text-right tabular-nums">{it.quantity}</td>
                        <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatPrice(num(it.line_total))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
            <dl className="space-y-1.5 border-t border-[#f3f4f6] px-4 py-3 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-[#6b7280]">Subtotal</dt>
                <dd className="tabular-nums">{formatPrice(num(order.subtotal))}</dd>
              </div>
              {num(order.discount_amount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-[#6b7280]">Discount{order.applied_promo_code ? ` (${order.applied_promo_code})` : ''}</dt>
                  <dd className="tabular-nums">−{formatPrice(num(order.discount_amount))}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[#6b7280]">Delivery{zone?.name ? ` (${zone.name})` : ''}</dt>
                <dd className="tabular-nums">{formatPrice(num(order.shipping_fee))}</dd>
              </div>
              <div className="flex justify-between border-t border-[#f3f4f6] pt-1.5 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPrice(num(order.grand_total))}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Payments">
            {(order.payments ?? []).length === 0 ? (
              <EmptyState title="No payment attempts yet" description="The customer has not started paying for this order." />
            ) : (
              <Table minWidth={620}>
                <thead>
                  <tr>
                    <th scope="col">Method</th>
                    <th scope="col">Reference</th>
                    <th scope="col" className="text-right">
                      Amount
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">Confirmed</th>
                  </tr>
                </thead>
                <tbody>
                  {order.payments.map((p) => {
                    const s = p.status === 'cancelled' ? { label: 'Not used', tone: 'neutral' as const } : paymentStatus(p.status);
                    const received = p.amount_received !== null && p.amount_received !== undefined ? num(p.amount_received) : null;
                    return (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap">{gatewayLabel(p.provider)}</td>
                        <td className="break-all text-xs text-[#4b5563]">{p.provider_reference || '—'}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {formatPrice(num(p.amount))}
                          {received !== null && received !== num(p.amount) && (
                            <span className="block text-xs text-red-700">Received {formatPrice(received)}</span>
                          )}
                        </td>
                        <td>
                          <StatusPill label={s.label} tone={s.tone} />
                        </td>
                        <td className="whitespace-nowrap text-xs text-[#4b5563]">{formatDateTime(p.verified_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Panel>

          {(order.refunds ?? []).length > 0 && (
            <Panel title="Refunds">
              <Table minWidth={520}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col" className="text-right">
                      Amount
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {order.refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatPrice(num(r.amount))}</td>
                      <td>
                        <StatusPill
                          label={`${humanize(r.status)}${r.restocked ? ' · restocked' : ''}`}
                          tone={r.status === 'completed' ? 'green' : r.status === 'rejected' ? 'neutral' : 'amber'}
                        />
                      </td>
                      <td className="text-xs text-[#4b5563]">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          )}

          <Panel title="History">
            {(order.history ?? []).length === 0 ? (
              <EmptyState title="No status changes yet" />
            ) : (
              <ol className="space-y-3 px-4 py-3">
                {order.history.map((h, i) => (
                  <li key={i} className="flex gap-3 text-[13px]">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#9ca3af]" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium text-[#111827]">
                        {h.previous_status ? `${orderStatus(h.previous_status).label} → ` : ''}
                        {orderStatus(h.new_status).label}
                      </p>
                      {h.comment && <p className="text-[#4b5563]">{h.comment}</p>}
                      <p className="text-xs text-[#6b7280]">
                        {formatDateTime(h.created_at)}
                        {h.changed_by_user_id ? '' : ' · system / customer'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Customer & delivery" bodyClassName="px-4 py-3">
            <DetailList
              items={[
                { label: 'Name', value: addr.full_name || '—' },
                { label: 'Email', value: order.guest_email || (order.user_id ? 'Signed-in customer' : '—') },
                { label: 'Phone', value: addr.phone || '—' },
                {
                  label: 'Address',
                  value:
                    [addr.address_line1, addr.address_line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(', ') || '—',
                },
                { label: 'Delivery zone', value: zone?.name ? `${zone.name}${zone.estimated_days ? ` · ${zone.estimated_days}` : ''}` : '—' },
                { label: 'Delivery fee', value: formatPrice(num(order.shipping_fee)) },
              ]}
            />
            {order.notes && (
              <div className="mt-3 rounded-lg bg-[#f9fafb] px-3 py-2 text-[13px] text-[#374151]">
                <p className="text-xs font-semibold text-[#6b7280]">Customer note</p>
                <p className="mt-0.5 whitespace-pre-line">{order.notes}</p>
              </div>
            )}
          </Panel>

          <Panel title="Shipment" bodyClassName="px-4 py-3">
            {order.shipment ? (
              <DetailList
                items={[
                  { label: 'Courier', value: order.shipment.carrier },
                  { label: 'Tracking number', value: order.shipment.tracking_number || '—' },
                  {
                    label: 'Tracking link',
                    value: order.shipment.tracking_url ? (
                      <a
                        href={order.shipment.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium underline"
                      >
                        Open tracking page
                        <ExternalLink className="size-3" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Status', value: humanize(order.shipment.status) },
                  { label: 'Shipped', value: formatDateTime(order.shipment.shipped_at) },
                  { label: 'Delivered', value: formatDateTime(order.shipment.delivered_at) },
                ]}
              />
            ) : (
              <p className="text-[13px] text-[#6b7280]">Not shipped yet.</p>
            )}
          </Panel>

          {(order.audit_logs ?? []).length > 0 && (
            <Panel title="Admin activity">
              <ul className="divide-y divide-[#f3f4f6]">
                {order.audit_logs.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-[13px]">
                    <p className="font-medium text-[#111827]">{humanize(a.action)}</p>
                    <p className="text-xs text-[#6b7280]">
                      {a.admin_name || 'System'} · {formatDateTime(a.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <ShipOrderModal orderNumber={shipOpen ? order.order_number : null} onClose={() => setShipOpen(false)} onShipped={reload} />

      <ManualPaymentModal
        open={paymentOpen}
        order={order}
        onClose={() => setPaymentOpen(false)}
        onDone={(updated) => {
          setData(updated);
          setPaymentOpen(false);
        }}
      />

      <StatusChangeModal
        target={statusTarget}
        order={order}
        onClose={() => setStatusTarget(null)}
        onDone={(updated) => {
          setData(updated);
          setStatusTarget(null);
        }}
      />
    </div>
  );
}

function StatusChangeModal({
  target,
  order,
  onClose,
  onDone,
}: {
  target: OrderStatus | null;
  order: OrderDetail;
  onClose: () => void;
  onDone: (order: OrderDetail) => void;
}) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    try {
      const updated = await adminUpdateOrderStatus(order.order_number, target, comment.trim() || undefined);
      toast.success(`Order moved to "${orderStatus(target).label}".`);
      setComment('');
      onDone(updated);
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      busy={saving}
      size="sm"
      title={target ? `${ORDER_TRANSITION_LABELS[target] ?? humanize(target)}?` : ''}
      description={target ? STATUS_CHANGE_HELP[target] : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="status-change-form" variant="primary" loading={saving}>
            Confirm
          </Button>
        </>
      }
    >
      <form id="status-change-form" onSubmit={submit} noValidate>
        <Field label="Note for the order history" hint="Optional.">
          {(p) => <TextArea {...p} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}
