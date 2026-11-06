// Small storefront helpers: cart lines, WhatsApp links, the store's address.
// Run with: npm run test:web
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAddedLines } from '../lib/cart-lines.ts';
import { storeAddressLine } from '../lib/store-address.ts';
import {
  buildWhatsAppInvoiceUrl,
  buildWhatsAppMessageUrl,
  buildWhatsAppPrePaymentHelpUrl,
  buildWhatsAppReceiptUrl,
  formatSupportPhone,
} from '../lib/whatsapp.ts';

const line = (id, quantity, maxStock = 50) => ({ id, quantity, maxStock, name: `Item ${id}` });

test('lines added while the cart loads survive the load', () => {
  const merged = withAddedLines([line('1', 2)], [{ line: line('9', 1), quantity: 1 }], 20);
  assert.deepEqual(merged.map((i) => [i.id, i.quantity]), [['1', 2], ['9', 1]]);
});

test('an added line counts on top of what the loaded cart holds, within the limits', () => {
  assert.equal(withAddedLines([line('1', 2)], [{ line: line('1', 1), quantity: 1 }], 20)[0].quantity, 3);
  assert.equal(withAddedLines([line('1', 2)], [{ line: line('1', 3, 3), quantity: 3 }], 20)[0].quantity, 3, 'stock');
  assert.equal(withAddedLines([line('1', 19)], [{ line: line('1', 5), quantity: 5 }], 20)[0].quantity, 20, 'per-line limit');
  const twice = withAddedLines([], [{ line: line('1', 1), quantity: 1 }, { line: line('1', 2), quantity: 1 }], 20);
  assert.deepEqual(twice.map((i) => [i.id, i.quantity]), [['1', 2]]);
});

test('without a store number there are no WhatsApp links', () => {
  const order = { order_number: 'ORD-1', grand_total: 100 };
  for (const phone of [null, undefined, '', '   ']) {
    assert.equal(buildWhatsAppInvoiceUrl(order, phone), '');
    assert.equal(buildWhatsAppReceiptUrl(order, phone), '');
    assert.equal(buildWhatsAppMessageUrl('Hello', phone), '');
    assert.equal(buildWhatsAppPrePaymentHelpUrl('ORD-1', 100, phone), '');
    assert.equal(buildWhatsAppPrePaymentHelpUrl(undefined, undefined, phone), '');
    assert.equal(formatSupportPhone(phone), '');
  }
});

test('with a store number the links use it', () => {
  assert.equal(buildWhatsAppMessageUrl('Hello you', '0803 123 4567'), 'https://wa.me/2348031234567?text=Hello%20you');
  assert.equal(buildWhatsAppInvoiceUrl({ order_number: 'ORD-1', grand_total: 1 }, '+2348031234567'), 'https://wa.me/2348031234567?text=ORD-1');
  assert.equal(formatSupportPhone('08031234567'), '+234 803 123 4567');
});

test('the store address does not repeat a city or state it already names', () => {
  assert.equal(
    storeAddressLine('12 Okpara Avenue, Independence Layout, Enugu, Nigeria', 'Enugu', 'Enugu'),
    '12 Okpara Avenue, Independence Layout, Enugu, Nigeria'
  );
  assert.equal(storeAddressLine('12 Okpara Avenue Enugu', 'enugu', 'Enugu State'), '12 Okpara Avenue Enugu, Enugu State');
  assert.equal(storeAddressLine('5 Allen Avenue, Ikeja, Lagos State', 'Ikeja', 'Lagos'), '5 Allen Avenue, Ikeja, Lagos State');
});

test('the store address adds what is missing, and a street named after a city is not the city', () => {
  assert.equal(storeAddressLine('5 Allen Avenue', 'Ikeja', 'Lagos'), '5 Allen Avenue, Ikeja, Lagos');
  assert.equal(storeAddressLine('12 Lagos Street', 'Ikeja', 'Lagos'), '12 Lagos Street, Ikeja, Lagos');
  assert.equal(storeAddressLine('', 'Ikeja', 'Ikeja'), 'Ikeja');
  assert.equal(storeAddressLine(null, null, ' '), '');
});
