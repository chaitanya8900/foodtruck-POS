import { PrismaClient, Role, ModifierSelectionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed process...');

  // 1. Create or update Default Business
  const business = await prisma.business.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'The Rolling Gourmet Food Truck',
      address: 'Plot 42, Food Street, Madhapur, Hyderabad, 500081',
      phone: '+91 9876543210',
      gstin: '36AAAAA0000A1Z5',
      fssai_number: '13621014000123',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      tax_rate: 5.0,
      receipt_header: 'The Rolling Gourmet Food Truck\nFresh, Fast & Delicious\nGSTIN: 36AAAAA0000A1Z5 | FSSAI: 13621014000123',
      receipt_footer: 'Thank you for your visit!\nFollow us @rollinggourmet\nHave a wonderful day!',
      is_dine_in_enabled: true,
      is_takeaway_enabled: true,
      is_active: true,
      token_prefix: 'T-',
      token_reset_time: '04:00',
      operating_hours: {
        monday: { open: '11:00', close: '23:00' },
        tuesday: { open: '11:00', close: '23:00' },
        wednesday: { open: '11:00', close: '23:00' },
        thursday: { open: '11:00', close: '23:00' },
        friday: { open: '11:00', close: '23:30' },
        saturday: { open: '11:00', close: '23:59' },
        sunday: { open: '11:00', close: '23:59' }
      }
    }
  });

  console.log(`Business seeded: ${business.name} (${business.id})`);

  // 2. Create Default Business Settings
  const defaultSettings = [
    { setting_key: 'printer_ip', setting_value: '192.168.1.100' },
    { setting_key: 'printer_port', setting_value: '9100' },
    { setting_key: 'auto_print_kot', setting_value: 'true' },
    { setting_key: 'auto_print_receipt', setting_value: 'true' },
    { setting_key: 'paper_width', setting_value: '80mm' }
  ];

  for (const s of defaultSettings) {
    await prisma.businessSetting.upsert({
      where: {
        business_id_setting_key: {
          business_id: business.id,
          setting_key: s.setting_key
        }
      },
      update: { setting_value: s.setting_value },
      create: {
        business_id: business.id,
        setting_key: s.setting_key,
        setting_value: s.setting_value
      }
    });
  }

  // 3. Create Users
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const cashierPasswordHash = await bcrypt.hash('cashier123', 10);
  const kitchenPasswordHash = await bcrypt.hash('kitchen123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@foodtruck.com' },
    update: { password_hash: adminPasswordHash, role: Role.ADMIN },
    create: {
      business_id: business.id,
      name: 'Truck Admin',
      email: 'admin@foodtruck.com',
      password_hash: adminPasswordHash,
      role: Role.ADMIN,
      is_active: true
    }
  });

  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@foodtruck.com' },
    update: { password_hash: cashierPasswordHash, role: Role.CASHIER },
    create: {
      business_id: business.id,
      name: 'Counter Cashier',
      email: 'cashier@foodtruck.com',
      password_hash: cashierPasswordHash,
      role: Role.CASHIER,
      is_active: true
    }
  });

  await prisma.user.upsert({
    where: { email: 'kitchen@foodtruck.com' },
    update: { password_hash: kitchenPasswordHash, role: Role.KITCHEN_STAFF },
    create: {
      business_id: business.id,
      name: 'Head Chef',
      email: 'kitchen@foodtruck.com',
      password_hash: kitchenPasswordHash,
      role: Role.KITCHEN_STAFF,
      is_active: true
    }
  });

  console.log(`Admin user: ${admin.email}`);
  console.log(`Cashier user: ${cashier.email}`);

  // Provision users in Supabase Auth if configured
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const defaultUsers = [
        { email: 'admin@foodtruck.com', password: 'admin123', name: 'Truck Admin', role: Role.ADMIN },
        { email: 'cashier@foodtruck.com', password: 'cashier123', name: 'Counter Cashier', role: Role.CASHIER },
        { email: 'kitchen@foodtruck.com', password: 'kitchen123', name: 'Head Chef', role: Role.KITCHEN_STAFF }
      ];
      for (const u of defaultUsers) {
        try {
          await supabase.auth.admin.createUser({
            email: u.email,
            password: u.password,
            email_confirm: true,
            user_metadata: { name: u.name, role: u.role, business_id: business.id }
          });
          console.log(`Synced user to Supabase Auth: ${u.email}`);
        } catch {
          console.log(`Supabase Auth user already exists: ${u.email}`);
        }
      }
    } catch (err: any) {
      console.warn(`Supabase Auth sync skipped: ${err?.message || err}`);
    }
  }

  // 4. Create Tables with unique QR tokens
  const tablesData = [
    { table_name: 'Table 1', qr_token: 'qr_tbl_01_a9f2e3' },
    { table_name: 'Table 2', qr_token: 'qr_tbl_02_b8c3d4' },
    { table_name: 'Table 3', qr_token: 'qr_tbl_03_c7d4e5' },
    { table_name: 'Table 4', qr_token: 'qr_tbl_04_d6e5f6' }
  ];

  for (const tbl of tablesData) {
    await prisma.table.upsert({
      where: { qr_token: tbl.qr_token },
      update: { table_name: tbl.table_name },
      create: {
        business_id: business.id,
        table_name: tbl.table_name,
        qr_token: tbl.qr_token,
        is_active: true
      }
    });
  }
  console.log('4 tables created with QR tokens');

  // 5. Create Menu Categories
  const catBurgers = await prisma.menuCategory.create({
    data: {
      business_id: business.id,
      name: 'Burgers',
      description: 'Handcrafted gourmet burgers with house-made sauces and fresh brioche buns',
      display_order: 1,
      is_active: true
    }
  });

  const catSnacks = await prisma.menuCategory.create({
    data: {
      business_id: business.id,
      name: 'Snacks & Sides',
      description: 'Crispy, crunchy quick bites and finger food',
      display_order: 2,
      is_active: true
    }
  });

  const catBeverages = await prisma.menuCategory.create({
    data: {
      business_id: business.id,
      name: 'Beverages',
      description: 'Refreshing chilled drinks, mocktails and artisanal coolers',
      display_order: 3,
      is_active: true
    }
  });

  const catDesserts = await prisma.menuCategory.create({
    data: {
      business_id: business.id,
      name: 'Desserts',
      description: 'Sweet indulgences to complete your meal',
      display_order: 4,
      is_active: true
    }
  });

  console.log('Categories created');

  // 6. Create Menu Items & Modifiers
  // Item 1: Classic Cheeseburger
  const burger1 = await prisma.menuItem.create({
    data: {
      business_id: business.id,
      category_id: catBurgers.id,
      name: 'Classic Cheeseburger',
      description: 'Juicy beef/veg patty with cheddar cheese, lettuce, tomato and signature sauce',
      price: 180.0,
      tax_rate: 5.0,
      preparation_time: 10,
      display_order: 1,
      is_available: true
    }
  });

  await prisma.modifierGroup.create({
    data: {
      business_id: business.id,
      menu_item_id: burger1.id,
      name: 'Patty & Cheese Extras',
      selection_type: ModifierSelectionType.MULTIPLE,
      min_selections: 0,
      max_selections: 2,
      is_required: false,
      display_order: 1,
      options: {
        create: [
          { name: 'Extra Cheddar Slice', additional_price: 30.0, display_order: 1 },
          { name: 'Double Patty', additional_price: 80.0, display_order: 2 }
        ]
      }
    }
  });

  await prisma.modifierGroup.create({
    data: {
      business_id: business.id,
      menu_item_id: burger1.id,
      name: 'Add-on Toppings',
      selection_type: ModifierSelectionType.MULTIPLE,
      min_selections: 0,
      max_selections: 3,
      is_required: false,
      display_order: 2,
      options: {
        create: [
          { name: 'Jalapenos', additional_price: 20.0, display_order: 1 },
          { name: 'Caramelized Onions', additional_price: 25.0, display_order: 2 },
          { name: 'Fried Egg', additional_price: 25.0, display_order: 3 }
        ]
      }
    }
  });

  // Item 2: Crispy Chicken Burger
  const burger2 = await prisma.menuItem.create({
    data: {
      business_id: business.id,
      category_id: catBurgers.id,
      name: 'Crispy Chicken Burger',
      description: 'Fried crisp spiced chicken breast with creamy slaw and spicy mayo',
      price: 210.0,
      tax_rate: 5.0,
      preparation_time: 12,
      display_order: 2,
      is_available: true
    }
  });

  await prisma.modifierGroup.create({
    data: {
      business_id: business.id,
      menu_item_id: burger2.id,
      name: 'Spice Level',
      selection_type: ModifierSelectionType.SINGLE,
      min_selections: 1,
      max_selections: 1,
      is_required: true,
      display_order: 1,
      options: {
        create: [
          { name: 'Mild', additional_price: 0.0, display_order: 1 },
          { name: 'Medium Spicy', additional_price: 0.0, display_order: 2 },
          { name: 'Extra Fiery', additional_price: 15.0, display_order: 3 }
        ]
      }
    }
  });

  // Item 3: Masala French Fries
  const snack1 = await prisma.menuItem.create({
    data: {
      business_id: business.id,
      category_id: catSnacks.id,
      name: 'Masala French Fries',
      description: 'Golden fries tossed in our secret spicy chaat masala blend',
      price: 120.0,
      tax_rate: 5.0,
      preparation_time: 7,
      display_order: 1,
      is_available: true
    }
  });

  await prisma.modifierGroup.create({
    data: {
      business_id: business.id,
      menu_item_id: snack1.id,
      name: 'Dip Selection',
      selection_type: ModifierSelectionType.SINGLE,
      min_selections: 0,
      max_selections: 2,
      is_required: false,
      display_order: 1,
      options: {
        create: [
          { name: 'Peri-Peri Mayo', additional_price: 25.0, display_order: 1 },
          { name: 'Warm Cheese Sauce', additional_price: 35.0, display_order: 2 },
          { name: 'Garlic Aioli', additional_price: 20.0, display_order: 3 }
        ]
      }
    }
  });

  // Item 4: Loaded Nachos
  await prisma.menuItem.create({
    data: {
      business_id: business.id,
      category_id: catSnacks.id,
      name: 'Loaded Nachos',
      description: 'Corn tortilla chips smothered in melted queso, salsa, jalapenos & sour cream',
      price: 160.0,
      tax_rate: 5.0,
      preparation_time: 8,
      display_order: 2,
      is_available: true
    }
  });

  // Item 5: Cold Coffee
  const bev1 = await prisma.menuItem.create({
    data: {
      business_id: business.id,
      category_id: catBeverages.id,
      name: 'Artisan Cold Coffee',
      description: 'Rich blended espresso with cold milk and vanilla cream',
      price: 90.0,
      tax_rate: 5.0,
      preparation_time: 5,
      display_order: 1,
      is_available: true
    }
  });

  await prisma.modifierGroup.create({
    data: {
      business_id: business.id,
      menu_item_id: bev1.id,
      name: 'Sweetness Level',
      selection_type: ModifierSelectionType.SINGLE,
      min_selections: 0,
      max_selections: 1,
      is_required: false,
      display_order: 1,
      options: {
        create: [
          { name: 'Less Sweet', additional_price: 0.0, display_order: 1 },
          { name: 'Regular Sweet', additional_price: 0.0, display_order: 2 },
          { name: 'With Hazelnut Syrup', additional_price: 25.0, display_order: 3 }
        ]
      }
    }
  });

  // Item 6: Lemon Iced Tea
  await prisma.menuItem.create({
    data: {
      business_id: business.id,
      category_id: catBeverages.id,
      name: 'Lemon Mint Iced Tea',
      description: 'Brewed black tea infused with fresh lemon and crushed mint leaves',
      price: 80.0,
      tax_rate: 5.0,
      preparation_time: 4,
      display_order: 2,
      is_available: true
    }
  });

  // Item 7: Chocolate Brownie
  await prisma.menuItem.create({
    data: {
      business_id: business.id,
      category_id: catDesserts.id,
      name: 'Sizzling Chocolate Brownie',
      description: 'Warm fudge brownie topped with vanilla gelato and dark chocolate ganache',
      price: 140.0,
      tax_rate: 5.0,
      preparation_time: 6,
      display_order: 1,
      is_available: true
    }
  });

  console.log('Menu items and modifiers seeded successfully');
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
