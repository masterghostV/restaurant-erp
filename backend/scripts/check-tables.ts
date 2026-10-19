/**
 * Self-check for the table -> order -> kitchen flow.
 *
 * Starts the REAL application code (login guard, role checks, input
 * validation, table and order logic) against a FAKE in-memory database, then
 * makes HTTP requests exactly like the Tables page and the Waiter screen do.
 * It never connects to PostgreSQL and never touches your real data.
 *
 * Run from the backend folder:   npx ts-node scripts/check-tables.ts
 * Expected result:               "36 passed, 0 failed"
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, ValidationPipe } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { RestaurantController } from '../src/restaurant/restaurant.controller';
import { RestaurantService } from '../src/restaurant/restaurant.service';
import { OrderController } from '../src/order/order.controller';
import { OrderService } from '../src/order/order.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';

const SECRET = process.env.JWT_SECRET || 'restaurant_erp_super_secret_key_987654321';
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra?: any) => {
  if (cond) { pass++; console.log('PASS -', name); } else { fail++; console.log('FAIL -', name, extra !== undefined ? JSON.stringify(extra) : ''); }
};

// ---------- fake users (one per role we care about) ----------
const mk = (id: string, role: string, rid: string | null) => ({
  id, email: `${id}@x`, name: id,
  role: { name: role, permissions: [] },
  staff: rid ? { id: 'S_' + id, restaurantId: rid, restaurant: { status: 'ACTIVE' } } : null,
});
const users: any = Object.fromEntries([
  mk('U_OWNER', 'OWNER', 'R1'), mk('U_MANAGER', 'MANAGER', 'R1'), mk('U_WAITER', 'WAITER', 'R1'),
  mk('U_KITCHEN1', 'KITCHEN', 'R1'), mk('U_WAITER2', 'WAITER', 'R2'), mk('U_SITE', 'SUPER_ADMIN', null),
].map((u) => [u.id, u]));

// ---------- fake in-memory database ----------
const db: any = {
  restaurants: [{ id: 'R1' }, { id: 'R2' }],
  tables: [
    { id: 'T-R2', number: 'Patio', capacity: 2, status: 'AVAILABLE', restaurantId: 'R2' },
    { id: 'T-HIST', number: 'History', capacity: 4, status: 'AVAILABLE', restaurantId: 'R1' },
  ],
  orders: [{ id: 'O-R2', restaurantId: 'R2', tableId: 'T-R2' }, { id: 'O-HIST', restaurantId: 'R1', tableId: 'T-HIST' }],
  menu: [
    { id: 'M-R1', name: 'Burger', price: 100, taxRate: 5, category: { restaurantId: 'R1' } },
    { id: 'M-R2', name: 'Pasta', price: 100, taxRate: 5, category: { restaurantId: 'R2' } },
  ],
};
let seq = 0;
const tableApi = {
  findFirst: async ({ where }: any) => db.tables.find((t: any) => t.restaurantId === where.restaurantId && t.number.toLowerCase() === where.number.equals.toLowerCase()) || null,
  create: async ({ data }: any) => { const t = { id: 'T' + ++seq, ...data }; db.tables.push(t); return t; },
  findMany: async ({ where }: any) => db.tables.filter((t: any) => t.restaurantId === where.restaurantId),
  findUnique: async ({ where }: any) => db.tables.find((t: any) => t.id === where.id) || null,
  update: async ({ where, data }: any) => Object.assign(db.tables.find((t: any) => t.id === where.id), data),
  delete: async ({ where }: any) => { db.tables = db.tables.filter((t: any) => t.id !== where.id); },
};
const prisma: any = {
  user: { findUnique: async ({ where }: any) => users[where.id] || null },
  restaurant: { findUnique: async ({ where }: any) => db.restaurants.find((r: any) => r.id === where.id) || null },
  table: tableApi,
  order: {
    count: async ({ where }: any) => db.orders.filter((o: any) => o.tableId === where.tableId).length,
    findUnique: async ({ where }: any) => db.orders.find((o: any) => o.id === where.id) || null,
  },
  menuItem: {
    findMany: async ({ where }: any) =>
      db.menu.filter((m: any) => where.id.in.includes(m.id) && m.category.restaurantId === where.category.restaurantId),
  },
  $transaction: async (fn: any) => fn({
    order: {
      create: async ({ data }: any) => {
        const o = { id: 'O' + ++seq, ...data, orderItems: data.orderItems.create, table: db.tables.find((t: any) => t.id === data.tableId) };
        db.orders.push(o); return o;
      },
    },
    table: tableApi,
    recipe: { findUnique: async () => null },
  }),
};
const events: any[] = [];
const rec = (kind: string) => (x: any) => events.push({ kind, x });
const realtime: any = {
  sendTableUpdate: rec('table'), sendKitchenUpdate: rec('kitchen'), sendOrderUpdate: rec('order'),
  sendInventoryUpdate: rec('inventory'), sendOwnerDashboardUpdate: rec('owner'),
};

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret: SECRET })],
  controllers: [RestaurantController, OrderController],
  providers: [RestaurantService, OrderService, JwtStrategy,
    { provide: PrismaService, useValue: prisma }, { provide: RealtimeGateway, useValue: realtime }],
})
class TestAppModule {}

(async () => {
  const app = await NestFactory.create(TestAppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // same as main.ts
  await app.listen(0);
  const base = `http://localhost:${(app.getHttpServer().address() as any).port}`;
  const jwt = new JwtService({ secret: SECRET });

  const call = async (method: string, path: string, userId?: string, body?: any) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers.Authorization = 'Bearer ' + jwt.sign({ sub: userId });
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data: any = null; try { data = await res.json(); } catch {}
    return { status: res.status, data, msg: Array.isArray(data?.message) ? data.message.join(', ') : data?.message };
  };

  console.log('\n=== MANAGER adds tables (exact payload the Tables page sends) ===');
  let r = await call('POST', '/restaurants/tables', 'U_MANAGER', { number: 'Table 5', capacity: 4, restaurantId: 'R1' });
  ok('manager adds "Table 5" -> 201', r.status === 201 && r.data.number === 'Table 5' && r.data.restaurantId === 'R1', r);
  const t5 = r.data;
  r = await call('POST', '/restaurants/tables', 'U_MANAGER', { number: 'Table 6', capacity: 2, restaurantId: 'R2' });
  ok("manager naming ANOTHER restaurant is ignored: table still lands in manager's own restaurant", r.status === 201 && r.data.restaurantId === 'R1', r);
  const t6 = r.data;
  r = await call('POST', '/restaurants/tables', 'U_OWNER', { number: 'Terrace', capacity: 6, restaurantId: 'R1' });
  ok('owner can add a table too -> 201', r.status === 201, r);
  r = await call('POST', '/restaurants/tables', 'U_MANAGER', { number: 'table 5', capacity: 4, restaurantId: 'R1' });
  ok('duplicate name rejected -> 400 with a readable message', r.status === 400 && /already exists/.test(r.msg), r);
  for (const [label, body] of [
    ['0 seats', { number: 'X', capacity: 0 }], ['51 seats', { number: 'X', capacity: 51 }],
    ['seats as text "abc"', { number: 'X', capacity: 'abc' }], ['missing name', { capacity: 4 }],
    ['31-character name', { number: 'x'.repeat(31), capacity: 4 }],
  ] as any) {
    r = await call('POST', '/restaurants/tables', 'U_MANAGER', body);
    ok(`bad input (${label}) -> 400`, r.status === 400, r);
  }
  r = await call('POST', '/restaurants/tables', 'U_SITE', { number: 'Z', capacity: 2 });
  ok('site owner without a restaurant -> 400', r.status === 400, r);
  r = await call('POST', '/restaurants/tables', undefined, { number: 'Z', capacity: 2 });
  ok('not logged in -> 401', r.status === 401, r);

  console.log('\n=== WAITER selects a table ===');
  r = await call('GET', '/restaurants/R1/tables', 'U_WAITER');
  const names = (r.data || []).map((t: any) => t.number);
  ok('waiter sees the tables the manager added (Table 5, Table 6, Terrace)', r.status === 200 && ['Table 5', 'Table 6', 'Terrace'].every((n) => names.includes(n)), names);
  ok("waiter does NOT see another restaurant's table", !names.includes('Patio'), names);
  r = await call('GET', '/restaurants/R2/tables', 'U_WAITER');
  ok("waiter cannot list another restaurant's tables -> 403", r.status === 403, r);
  r = await call('POST', '/restaurants/tables', 'U_WAITER', { number: 'Hack', capacity: 2 });
  ok('waiter cannot ADD a table -> 403', r.status === 403, r);
  r = await call('DELETE', `/restaurants/tables/${t6.id}`, 'U_WAITER');
  ok('waiter cannot DELETE a table -> 403', r.status === 403, r);

  console.log('\n=== WAITER places an order for the selected table (exact payload the waiter screen sends) ===');
  events.length = 0;
  r = await call('POST', '/orders', 'U_WAITER', {
    tableId: t5.id, waiterId: 'U_WAITER', restaurantId: 'R1', notes: '',
    items: [{ menuItemId: 'M-R1', quantity: 2, notes: '' }],
  });
  ok('order for the new table accepted -> 201', r.status === 201 && r.data.tableId === t5.id && r.data.restaurantId === 'R1', r);
  ok('order total is right (2 x 100 + 5% tax = 210)', r.status === 201 && Math.abs(r.data.totalPrice - 210) < 0.001, r.data?.totalPrice);
  ok('table became OCCUPIED', db.tables.find((t: any) => t.id === t5.id).status === 'OCCUPIED');
  const kitchen = events.find((e) => e.kind === 'kitchen');
  ok("order was pushed to the KITCHEN, tagged with the waiter's restaurant R1", !!kitchen && kitchen.x.restaurantId === 'R1' && kitchen.x.tableId === t5.id, kitchen);

  r = await call('PUT', `/restaurants/tables/${t5.id}/status`, 'U_WAITER', { status: 'BILLING' });
  ok('waiter "send to cashier" (BILLING) still works -> 200', r.status === 200 && r.data.status === 'BILLING', r);
  r = await call('PUT', `/restaurants/tables/${t5.id}/status`, 'U_WAITER', { status: 'NONSENSE' });
  ok('made-up table status -> 400', r.status === 400, r);
  r = await call('PUT', '/restaurants/tables/T-R2/status', 'U_WAITER', { status: 'OCCUPIED' });
  ok("waiter cannot change another restaurant's table -> 403", r.status === 403, r);

  console.log('\n=== orders cannot cross restaurants ===');
  r = await call('POST', '/orders', 'U_WAITER2', { tableId: t5.id, restaurantId: 'R2', items: [{ menuItemId: 'M-R2', quantity: 1 }] });
  ok("a waiter from restaurant 2 cannot use restaurant 1's table -> 404", r.status === 404, r);
  r = await call('POST', '/orders', 'U_WAITER', { tableId: t6.id, restaurantId: 'R2', items: [{ menuItemId: 'M-R1', quantity: 1 }] });
  ok("a waiter naming another restaurant in the request still orders into their OWN restaurant", r.status === 201 && r.data.restaurantId === 'R1', r);
  r = await call('POST', '/orders', 'U_WAITER', { tableId: t6.id, restaurantId: 'R1', items: [{ menuItemId: 'M-R2', quantity: 1 }] });
  ok("another restaurant's menu item cannot be ordered -> 404", r.status === 404, r);
  r = await call('POST', '/orders', 'U_WAITER', { tableId: t6.id, restaurantId: 'R1', items: [] });
  ok('empty order -> 400', r.status === 400, r);
  r = await call('PUT', '/orders/O-R2/status', 'U_KITCHEN1', { status: 'READY' });
  ok("kitchen of restaurant 1 cannot touch restaurant 2's order -> 403", r.status === 403, r);

  console.log('\n=== MANAGER removes tables ===');
  r = await call('POST', '/restaurants/tables', 'U_MANAGER', { number: 'Spare', capacity: 2, restaurantId: 'R1' });
  const spare = r.data;
  r = await call('DELETE', `/restaurants/tables/${t6.id}`, 'U_MANAGER');
  ok('a table that already took an order (Table 6) is protected from deletion -> 400', r.status === 400 && /history/.test(r.msg), r);
  events.length = 0;
  r = await call('DELETE', `/restaurants/tables/${spare.id}`, 'U_MANAGER');
  ok('manager deletes an unused table -> 200', r.status === 200 && !db.tables.some((t: any) => t.id === spare.id), r);
  ok('...and waiter screens are told to drop it', events.some((e) => e.kind === 'table' && e.x.deleted && e.x.id === spare.id));
  r = await call('GET', '/restaurants/R1/tables', 'U_WAITER');
  ok('...and the waiter no longer sees it in the table list', !(r.data || []).some((t: any) => t.number === 'Spare'));
  r = await call('DELETE', `/restaurants/tables/${t5.id}`, 'U_MANAGER');
  ok('table that has orders cannot be deleted -> 400 with a clear message', r.status === 400 && /history/.test(r.msg), r);
  r = await call('DELETE', '/restaurants/tables/T-R2', 'U_MANAGER');
  ok("manager cannot delete another restaurant's table -> 403", r.status === 403, r);
  r = await call('DELETE', '/restaurants/tables/NOPE', 'U_MANAGER');
  ok('unknown table -> 404', r.status === 404, r);
  r = await call('GET', '/restaurants/R2/tables', 'U_MANAGER');
  ok("manager cannot list another restaurant's tables -> 403", r.status === 403, r);

  console.log(`\n${pass} passed, ${fail} failed`);
  await app.close();
  process.exit(fail ? 1 : 0);
})();
