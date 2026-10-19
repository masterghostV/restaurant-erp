import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Permissions
  const permissionsList = [
    { name: 'full_access', description: 'Super admin master capability' },
    { name: 'view_dashboard', description: 'View business stats and summaries' },
    { name: 'manage_staff', description: 'CRUD staff profiles and attendance logs' },
    { name: 'create_order', description: 'Enter KOT orders' },
    { name: 'update_order_status', description: 'Modify order status' },
    { name: 'process_payment', description: 'Accept payment and issue bills' },
    { name: 'manage_inventory', description: 'Manage raw materials, stock, suppliers' },
    { name: 'manage_menu', description: 'CRUD categories, items, and recipes' },
    { name: 'submit_complaint', description: 'Log a staff complaint' },
    { name: 'resolve_complaint', description: 'Review and close tickets' },
    { name: 'manage_settings', description: 'Change restaurant parameters' },
  ];

  const dbPermissions = [];
  for (const perm of permissionsList) {
    const p = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm,
    });
    dbPermissions.push(p);
  }

  // Helper to find permissions by name
  const getPerms = (names: string[]) => dbPermissions.filter((p) => names.includes(p.name));

  // 2. Create Roles and link Permissions
  const rolesList = [
    { name: 'SUPER_ADMIN', description: 'SaaS Platform Owner', perms: ['full_access'] },
    { name: 'OWNER', description: 'Restaurant Outlet Owner', perms: ['view_dashboard', 'submit_complaint', 'resolve_complaint'] },
    {
      name: 'MANAGER',
      description: 'Restaurant manager — runs the floor (tables, orders) for one outlet',
      perms: ['view_dashboard', 'update_order_status', 'submit_complaint', 'resolve_complaint'],
    },
    {
      name: 'CASHIER',
      description: 'Checkout desk manager',
      perms: ['view_dashboard', 'create_order', 'process_payment', 'submit_complaint'],
    },
    {
      name: 'WAITER',
      description: 'Order taking staff',
      perms: ['create_order', 'update_order_status', 'submit_complaint'],
    },
    {
      name: 'KITCHEN',
      description: 'Chef and kitchen crew',
      perms: ['update_order_status', 'submit_complaint'],
    },
    {
      name: 'INVENTORY_STAFF',
      description: 'Store room operator',
      perms: ['manage_inventory', 'submit_complaint'],
    },
    {
      name: 'MENU_MANAGER',
      description: 'Head chef / Menu setter',
      perms: ['manage_menu', 'submit_complaint'],
    },
  ];

  const dbRoles: Record<string, any> = {};
  for (const r of rolesList) {
    dbRoles[r.name] = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: {
        name: r.name,
        description: r.description,
        permissions: {
          connect: getPerms(r.perms).map((p) => ({ id: p.id })),
        },
      },
    });
  }

  // 3. Create Default Restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Gourmet Garden Outlet',
      address: '456 Food Boulevard, Silicon Valley',
      phone: '+14155552671',
      gstNumber: '07AAAAA1111A1Z1',
    },
  });

  // 4. Create Users (Password: password123)
  const passwordHash = await bcrypt.hash('password123', 10);

  const usersList = [
    { email: 'admin@restaurant.com', name: 'Platform Admin', roleName: 'SUPER_ADMIN', isStaff: false },
    { email: 'owner@restaurant.com', name: 'Mr. John Owner', roleName: 'OWNER', isStaff: true, salary: 120000 },
    { email: 'manager@restaurant.com', name: 'Maya Manager', roleName: 'MANAGER', isStaff: true, salary: 45000 },
    { email: 'cashier@restaurant.com', name: 'Robert Cashier', roleName: 'CASHIER', isStaff: true, salary: 25000 },
    { email: 'waiter@restaurant.com', name: 'Sam Waiter', roleName: 'WAITER', isStaff: true, salary: 18000 },
    { email: 'kitchen@restaurant.com', name: 'Chef Mario', roleName: 'KITCHEN', isStaff: true, salary: 40000 },
    { email: 'inventory@restaurant.com', name: 'Sarah Storekeeper', roleName: 'INVENTORY_STAFF', isStaff: true, salary: 22000 },
    { email: 'menu@restaurant.com', name: 'Julia Menu Planner', roleName: 'MENU_MANAGER', isStaff: true, salary: 35000 },
  ];

  for (const u of usersList) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: {
        email: u.email,
        password: passwordHash,
        name: u.name,
        roleId: dbRoles[u.roleName].id,
        isVerified: true,
      },
    });

    if (u.isStaff) {
      await prisma.staff.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          restaurantId: restaurant.id,
          phone: '+15550009988',
          salary: u.salary || 0,
          status: 'ACTIVE',
        },
      });
    }
  }

  // 5. Create Dining Tables
  const tables = [
    { number: 'T-01', capacity: 2 },
    { number: 'T-02', capacity: 4 },
    { number: 'T-03', capacity: 4 },
    { number: 'T-04', capacity: 6 },
    { number: 'T-05', capacity: 8 },
  ];

  for (const t of tables) {
    await prisma.table.create({
      data: {
        number: t.number,
        capacity: t.capacity,
        restaurantId: restaurant.id,
        status: 'AVAILABLE',
      },
    });
  }

  // 6. Create Suppliers
  const supplier = await prisma.supplier.create({
    data: {
      name: 'Apex Food Suppliers',
      contactPerson: 'David Supplier',
      phone: '+14155550192',
      email: 'sales@apexsuppliers.com',
      address: 'Industrial District Road 5',
      restaurantId: restaurant.id,
    },
  });

  // 7. Create Inventory Items (Raw Materials)
  const rawMaterials = [
    { name: 'Pizza Dough', quantity: 100, unit: 'pcs', threshold: 10 },
    { name: 'Mozzarella Cheese', quantity: 50, unit: 'kg', threshold: 5 },
    { name: 'Tomato Sauce', quantity: 30, unit: 'liters', threshold: 5 },
    { name: 'Pepperoni', quantity: 20, unit: 'kg', threshold: 3 },
    { name: 'Garlic Butter', quantity: 10, unit: 'kg', threshold: 2 },
    { name: 'Fresh Herbs', quantity: 5, unit: 'kg', threshold: 1 },
  ];

  const dbInventoryItems: Record<string, any> = {};
  for (const rm of rawMaterials) {
    dbInventoryItems[rm.name] = await prisma.inventoryItem.create({
      data: {
        name: rm.name,
        quantity: rm.quantity,
        unit: rm.unit,
        threshold: rm.threshold,
        restaurantId: restaurant.id,
      },
    });
  }

  // 8. Create Menu Categories
  const categories = [
    { name: 'Pizzas', description: 'Woodfired Italian Pizzas' },
    { name: 'Sides', description: 'Appetizers and snacks' },
    { name: 'Drinks', description: 'Cold beverages and juices' },
  ];

  const dbCategories: Record<string, any> = {};
  for (const c of categories) {
    dbCategories[c.name] = await prisma.menuCategory.create({
      data: {
        name: c.name,
        description: c.description,
        restaurantId: restaurant.id,
      },
    });
  }

  // 9. Create Menu Items & Recipes
  // Item 1: Pepperoni Pizza
  const pepperoniPizza = await prisma.menuItem.create({
    data: {
      name: 'Pepperoni Pizza',
      description: 'Woodfired thin crust pizza loaded with premium pepperoni slice & extra cheese',
      price: 18.99,
      imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=500&auto=format&fit=crop&q=60',
      categoryId: dbCategories['Pizzas'].id,
      taxRate: 5.0,
    },
  });

  const pizzaRecipe = await prisma.recipe.create({
    data: {
      menuItemId: pepperoniPizza.id,
      description: 'Standard preparation protocol for Pepperoni Pizza',
    },
  });

  await prisma.recipeIngredient.createMany({
    data: [
      { recipeId: pizzaRecipe.id, inventoryItemId: dbInventoryItems['Pizza Dough'].id, quantityNeeded: 1.0 },
      { recipeId: pizzaRecipe.id, inventoryItemId: dbInventoryItems['Mozzarella Cheese'].id, quantityNeeded: 0.2 },
      { recipeId: pizzaRecipe.id, inventoryItemId: dbInventoryItems['Tomato Sauce'].id, quantityNeeded: 0.1 },
      { recipeId: pizzaRecipe.id, inventoryItemId: dbInventoryItems['Pepperoni'].id, quantityNeeded: 0.1 },
    ],
  });

  // Item 2: Cheese Pizza
  const cheesePizza = await prisma.menuItem.create({
    data: {
      name: 'Cheese Pizza',
      description: 'Classic cheese margherita pizza',
      price: 14.99,
      imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&auto=format&fit=crop&q=60',
      categoryId: dbCategories['Pizzas'].id,
      taxRate: 5.0,
    },
  });

  const cheeseRecipe = await prisma.recipe.create({
    data: {
      menuItemId: cheesePizza.id,
      description: 'Margherita recipe',
    },
  });

  await prisma.recipeIngredient.createMany({
    data: [
      { recipeId: cheeseRecipe.id, inventoryItemId: dbInventoryItems['Pizza Dough'].id, quantityNeeded: 1.0 },
      { recipeId: cheeseRecipe.id, inventoryItemId: dbInventoryItems['Mozzarella Cheese'].id, quantityNeeded: 0.25 },
      { recipeId: cheeseRecipe.id, inventoryItemId: dbInventoryItems['Tomato Sauce'].id, quantityNeeded: 0.1 },
    ],
  });

  // Item 3: Garlic Bread
  const garlicBread = await prisma.menuItem.create({
    data: {
      name: 'Garlic Bread',
      description: 'Four pieces of toasted baguette spread with premium garlic spread and mixed herbs',
      price: 7.99,
      imageUrl: 'https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?w=500&auto=format&fit=crop&q=60',
      categoryId: dbCategories['Sides'].id,
      taxRate: 5.0,
    },
  });

  const breadRecipe = await prisma.recipe.create({
    data: {
      menuItemId: garlicBread.id,
      description: 'Preparation of Garlic bread sides',
    },
  });

  await prisma.recipeIngredient.createMany({
    data: [
      { recipeId: breadRecipe.id, inventoryItemId: dbInventoryItems['Garlic Butter'].id, quantityNeeded: 0.05 },
      { recipeId: breadRecipe.id, inventoryItemId: dbInventoryItems['Fresh Herbs'].id, quantityNeeded: 0.01 },
    ],
  });

  // Item 4: Coca Cola (no recipe needed, standard direct sale)
  await prisma.menuItem.create({
    data: {
      name: 'Coca Cola',
      description: 'Chilled can of Coke',
      price: 2.5,
      imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60',
      categoryId: dbCategories['Drinks'].id,
      taxRate: 5.0,
    },
  });

  // 10. Create Default Settings
  const defaultSettings = [
    { key: 'tax_percentage', value: '5.0', type: 'NUMBER' },
    { key: 'service_charge_percentage', value: '10.0', type: 'NUMBER' },
    { key: 'currency', value: 'USD', type: 'STRING' },
    { key: 'theme', value: 'dark', type: 'STRING' },
    { key: 'enable_kot_print', value: 'true', type: 'BOOLEAN' },
    { key: 'backup_frequency', value: 'daily', type: 'STRING' },
    { key: 'store_timing', value: '11:00 AM - 11:00 PM', type: 'STRING' },
  ];

  for (const s of defaultSettings) {
    await prisma.setting.create({
      data: {
        restaurantId: restaurant.id,
        key: s.key,
        value: s.value,
        type: s.type,
      },
    });
  }

  // 11. Create Audit Logs
  await prisma.auditLog.create({
    data: {
      action: 'SYSTEM_SEED',
      details: 'Populated initial database records with seed configuration.',
      ipAddress: '127.0.0.1',
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
