const cronService = require('../services/cronService');
const emailService = require('../services/emailService');
const Inventory = require('../models/Inventory');

describe('Low-Stock Cron Alert Service Suite (M2)', () => {
  beforeEach(async () => {
    emailService.clearSentEmails();
  });

  it('CRON_01: Item with stock < threshold is detected', async () => {
    const item = await Inventory.create({
      name: 'Low Stock Base',
      category: 'base',
      price: 50,
      stock: 12,
      threshold: 20
    });

    const alerts = await cronService.checkLowStockNow();
    expect(alerts.some((a) => a.itemId === item._id.toString())).toBe(true);
    const alert = alerts.find((a) => a.itemId === item._id.toString());
    expect(alert.stock).toBe(12);
    expect(alert.threshold).toBe(20);
    expect(alert.category).toBe('base');
  });

  it('CRON_02: Item with stock === threshold is NOT flagged (Exact Boundary)', async () => {
    const item = await Inventory.create({
      name: 'Boundary Safe Sauce',
      category: 'sauce',
      price: 30,
      stock: 20,
      threshold: 20
    });

    const alerts = await cronService.checkLowStockNow();
    expect(alerts.some((a) => a.itemId === item._id.toString())).toBe(false);
  });

  it('CRON_03: Item with stock === threshold - 1 IS flagged (Exact Boundary)', async () => {
    const item = await Inventory.create({
      name: 'Boundary Low Cheese',
      category: 'cheese',
      price: 60,
      stock: 19,
      threshold: 20
    });

    const alerts = await cronService.checkLowStockNow();
    expect(alerts.some((a) => a.itemId === item._id.toString())).toBe(true);
  });

  it('CRON_04: Item with stock > threshold is NOT flagged', async () => {
    const item = await Inventory.create({
      name: 'Plentiful Veggies',
      category: 'veggie',
      price: 25,
      stock: 50,
      threshold: 20
    });

    const alerts = await cronService.checkLowStockNow();
    expect(alerts.some((a) => a.itemId === item._id.toString())).toBe(false);
  });

  it('CRON_05: Multi-category aggregation in single evaluation', async () => {
    const b = await Inventory.create({
      name: 'Low Base',
      category: 'base',
      price: 50,
      stock: 5,
      threshold: 15
    });
    const s = await Inventory.create({
      name: 'Low Sauce',
      category: 'sauce',
      price: 30,
      stock: 3,
      threshold: 15
    });
    const v = await Inventory.create({
      name: 'Low Veggie',
      category: 'veggie',
      price: 25,
      stock: 2,
      threshold: 10
    });

    const alerts = await cronService.checkLowStockNow();
    expect(alerts.some((a) => a.itemId === b._id.toString())).toBe(true);
    expect(alerts.some((a) => a.itemId === s._id.toString())).toBe(true);
    expect(alerts.some((a) => a.itemId === v._id.toString())).toBe(true);
    expect(alerts.length).toBe(3);
  });

  it('CRON_06: Restocking clears item from next evaluation', async () => {
    const item = await Inventory.create({
      name: 'Depleted Item',
      category: 'base',
      price: 50,
      stock: 5,
      threshold: 20
    });

    let alerts = await cronService.checkLowStockNow();
    expect(alerts.some((a) => a.itemId === item._id.toString())).toBe(true);

    // Restock
    await Inventory.findByIdAndUpdate(item._id, { stock: 40 });

    alerts = await cronService.checkLowStockNow();
    expect(alerts.some((a) => a.itemId === item._id.toString())).toBe(false);
  });

  it('CRON_07: Clean execution with zero low items', async () => {
    await Inventory.create({
      name: 'Healthy Item',
      category: 'base',
      price: 50,
      stock: 100,
      threshold: 20
    });

    const alerts = await cronService.checkLowStockNow();
    expect(alerts.length).toBe(0);
    expect(emailService.getSentEmails().length).toBe(0);
  });

  it('CRON_08: Nodemailer alert email dispatched when items low', async () => {
    await Inventory.create({
      name: 'Critically Low Ingredient',
      category: 'cheese',
      price: 60,
      stock: 2,
      threshold: 15
    });

    await cronService.checkLowStockNow();

    const sent = emailService.getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe(process.env.ADMIN_EMAIL || process.env.EMAIL_USER || 'admin@pizzadelivery.com');
    expect(sent[0].subject).toMatch(/low stock/i);
  });

  it('CRON_09: Email content contains required telemetry', async () => {
    await Inventory.create({
      name: 'Jalapenos',
      category: 'veggie',
      price: 25,
      stock: 4,
      threshold: 15
    });

    await cronService.checkLowStockNow();

    const lastEmail = emailService.getLastSentEmail();
    expect(lastEmail).not.toBeNull();
    expect(lastEmail.html).toContain('Jalapenos');
    expect(lastEmail.html).toContain('veggie');
    expect(lastEmail.html).toContain('4');
    expect(lastEmail.html).toContain('15');
  });

  it('CRON_10: Robust handling of empty collection or boundary thresholds', async () => {
    await Inventory.create({
      name: 'Zero Threshold Item',
      category: 'base',
      price: 50,
      stock: 0,
      threshold: 0
    });

    // 0 is not < 0, so not flagged
    const alerts = await cronService.checkLowStockNow();
    expect(alerts.length).toBe(0);
  });
});
