import net from 'net';
import { EventEmitter } from 'events';
import { PrinterType, PrinterStatus, IPrinter, OrderData } from './types';
import { AppConfig } from './config';
import { createChildLogger } from './logger';
import { generateCustomerReceipt } from './templates/receipt';
import { generateKitchenOrderTicket } from './templates/kot';

const log = createChildLogger('Printer');

// ==========================================
// 1. Console Printer (Dev / Testing)
// ==========================================
export class ConsolePrinter implements IPrinter {
  readonly type: PrinterType = 'console';
  private status: PrinterStatus = 'connected';

  async connect(): Promise<void> {
    this.status = 'connected';
    log.info('Console printer initialized. Ready to print directly to terminal.');
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    log.info('Console printer disconnected.');
  }

  getStatus(): PrinterStatus {
    return this.status;
  }

  async print(buffer: Buffer, plainTextPreview?: string): Promise<boolean> {
    this.status = 'printing';

    // Simulate realistic thermal printer paper feed delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    const boxWidth = 56;
    const horizontalBorder = '─'.repeat(boxWidth);

    console.log('\n');
    console.log(`┌${horizontalBorder}┐`);
    console.log(`│${' [THERMAL RECEIPT PRINTER - CONSOLE OUTPUT] '.padStart(Math.floor((boxWidth + 44) / 2)).padEnd(boxWidth)}│`);
    console.log(`├${horizontalBorder}┤`);

    if (plainTextPreview) {
      const lines = plainTextPreview.split('\n');
      for (const line of lines) {
        // Pad line to fit box
        const truncatedOrPadded = line.length > boxWidth - 4
          ? line.substring(0, boxWidth - 4)
          : line.padEnd(boxWidth - 4);
        console.log(`│  ${truncatedOrPadded}  │`);
      }
    } else {
      console.log(`│  [Raw ESC/POS Data: ${buffer.length} bytes]${' '.repeat(boxWidth - 30)}│`);
    }

    console.log(`├${horizontalBorder}┤`);
    console.log(`│${' ✂️  === PAPER CUT === ✂️ '.padStart(Math.floor((boxWidth + 24) / 2)).padEnd(boxWidth)}│`);
    console.log(`└${horizontalBorder}┘\n`);

    this.status = 'connected';
    return true;
  }

  async testPrint(): Promise<boolean> {
    const sampleData: OrderData = {
      orderId: 'TEST-001',
      orderNumber: 'TEST01',
      tokenNo: '999',
      orderType: 'DINE-IN',
      tableNo: '01',
      date: new Date().toLocaleDateString('en-GB'),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      businessName: 'FOOD TRUCK TEST',
      items: [
        { name: 'Test Burger', quantity: 1, price: 150, customizations: ['Extra Cheese'] },
        { name: 'Cold Drink', quantity: 1, price: 50 },
      ],
      subtotal: 200,
      taxRate: 5,
      taxAmount: 10,
      total: 210,
      paymentMethod: 'TEST_MODE',
      specialInstructions: 'Test ticket for thermal printer',
    };

    log.info('Running Console Test Print (Receipt & KOT)...');
    const receipt = generateCustomerReceipt(sampleData);
    await this.print(receipt.buffer, receipt.plainText);

    const kot = generateKitchenOrderTicket(sampleData);
    await this.print(kot.buffer, kot.plainText);

    return true;
  }
}

// ==========================================
// 2. Network Printer (TCP / IP Socket)
// ==========================================
export class NetworkPrinter implements IPrinter {
  readonly type: PrinterType = 'network';
  private status: PrinterStatus = 'disconnected';
  private socket: net.Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor(
    private readonly ip: string,
    private readonly port: number,
    private readonly reconnectInterval: number = 5000,
    private readonly onStatusChange?: (status: PrinterStatus, error?: string) => void
  ) {}

  private updateStatus(newStatus: PrinterStatus, error?: string): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      log.info({ status: newStatus, ip: this.ip, port: this.port }, 'Network printer status changed');
      if (this.onStatusChange) {
        this.onStatusChange(newStatus, error);
      }
    }
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.status === 'connected') return;

    this.isConnecting = true;
    log.info({ ip: this.ip, port: this.port }, 'Connecting to network thermal printer...');

    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.destroy();
        this.socket = null;
      }

      const socket = new net.Socket();
      this.socket = socket;

      socket.setTimeout(5000);

      socket.connect(this.port, this.ip, () => {
        this.isConnecting = false;
        socket.setTimeout(0); // clear connect timeout
        this.updateStatus('connected');
        log.info({ ip: this.ip, port: this.port }, 'Successfully connected to network thermal printer');
        resolve();
      });

      socket.on('error', (err) => {
        this.isConnecting = false;
        log.error({ err: err.message, ip: this.ip, port: this.port }, 'Network printer connection error');
        this.updateStatus('error', err.message);
        this.scheduleReconnect();
        resolve(); // Resolve promise so startup isn't blocked
      });

      socket.on('close', (hadError) => {
        this.isConnecting = false;
        if (this.status !== 'disconnected') {
          log.warn({ hadError, ip: this.ip, port: this.port }, 'Network printer connection closed');
          this.updateStatus('disconnected');
          this.scheduleReconnect();
        }
      });

      socket.on('timeout', () => {
        this.isConnecting = false;
        log.warn({ ip: this.ip, port: this.port }, 'Network printer connection timed out');
        socket.destroy();
        this.updateStatus('disconnected', 'Connection timed out');
        this.scheduleReconnect();
        resolve();
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    log.info(`Scheduling network printer reconnect attempt in ${this.reconnectInterval}ms...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err) {
        log.error({ err }, 'Error during scheduled printer reconnect');
      }
    }, this.reconnectInterval);
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.updateStatus('disconnected');
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }
    log.info('Network printer disconnected.');
  }

  getStatus(): PrinterStatus {
    return this.status;
  }

  async print(buffer: Buffer): Promise<boolean> {
    if (!this.socket || this.status !== 'connected') {
      log.warn('Network printer not connected. Attempting quick reconnect before printing...');
      await this.connect();
      if (!this.socket || this.status !== 'connected') {
        throw new Error(`Cannot print: Network printer at ${this.ip}:${this.port} is disconnected`);
      }
    }

    this.updateStatus('printing');

    return new Promise((resolve, reject) => {
      const socket = this.socket!;
      socket.write(buffer, (err) => {
        if (err) {
          log.error({ err: err.message }, 'Failed to write bytes to network printer');
          this.updateStatus('error', err.message);
          return reject(err);
        }
        this.updateStatus('connected');
        log.info({ bytesWritten: buffer.length }, 'Successfully sent print data to network printer');
        resolve(true);
      });
    });
  }

  async testPrint(): Promise<boolean> {
    const sampleData: OrderData = {
      orderId: 'NET-TEST-001',
      orderNumber: 'NET01',
      tokenNo: '888',
      orderType: 'DINE-IN',
      tableNo: '01',
      date: new Date().toLocaleDateString('en-GB'),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      businessName: 'NETWORK TEST PRINT',
      items: [{ name: 'Network Printer Test Slip', quantity: 1, price: 0 }],
      total: 0,
      paymentMethod: 'TEST',
    };
    const receipt = generateCustomerReceipt(sampleData);
    return this.print(receipt.buffer);
  }
}

// ==========================================
// 3. USB Printer (Hardware Fallback)
// ==========================================
export class UsbPrinter implements IPrinter {
  readonly type: PrinterType = 'usb';
  private status: PrinterStatus = 'disconnected';
  private escposDevice: any = null;
  private escposPrinter: any = null;

  constructor(
    private readonly onStatusChange?: (status: PrinterStatus, error?: string) => void
  ) {}

  private updateStatus(newStatus: PrinterStatus, error?: string): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      log.info({ status: newStatus }, 'USB printer status changed');
      if (this.onStatusChange) {
        this.onStatusChange(newStatus, error);
      }
    }
  }

  async connect(): Promise<void> {
    try {
      // Dynamically load escpos and escpos-usb to ensure safe failure if libusb/hardware is absent
      const escpos = require('escpos');
      const USB = require('escpos-usb');
      escpos.USB = USB;

      const device = new escpos.USB();
      this.escposDevice = device;

      await new Promise<void>((resolve, reject) => {
        device.open((err: Error | null) => {
          if (err) {
            return reject(err);
          }
          this.escposPrinter = new escpos.Printer(device);
          this.updateStatus('connected');
          log.info('Connected to USB thermal printer');
          resolve();
        });
      });
    } catch (err: any) {
      log.warn({ err: err.message }, 'Could not open USB printer. Ensure printer is connected via USB and drivers are installed.');
      this.updateStatus('error', err.message);
    }
  }

  async disconnect(): Promise<void> {
    this.updateStatus('disconnected');
    if (this.escposDevice && typeof this.escposDevice.close === 'function') {
      try {
        this.escposDevice.close();
      } catch (err) {
        log.error({ err }, 'Error closing USB printer device');
      }
    }
    this.escposDevice = null;
    this.escposPrinter = null;
  }

  getStatus(): PrinterStatus {
    return this.status;
  }

  async print(buffer: Buffer): Promise<boolean> {
    if (!this.escposDevice || this.status !== 'connected') {
      throw new Error('USB Printer is not connected');
    }

    this.updateStatus('printing');

    return new Promise((resolve, reject) => {
      this.escposDevice.write(buffer, (err: Error | null) => {
        if (err) {
          log.error({ err: err.message }, 'Failed to write bytes to USB printer');
          this.updateStatus('error', err.message);
          return reject(err);
        }
        this.updateStatus('connected');
        resolve(true);
      });
    });
  }

  async testPrint(): Promise<boolean> {
    const sampleData: OrderData = {
      orderId: 'USB-TEST-001',
      orderNumber: 'USB01',
      tokenNo: '777',
      orderType: 'DINE-IN',
      tableNo: '01',
      date: new Date().toLocaleDateString('en-GB'),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      businessName: 'USB TEST PRINT',
      items: [{ name: 'USB Test Item', quantity: 1, price: 0 }],
      total: 0,
      paymentMethod: 'TEST',
    };
    const receipt = generateCustomerReceipt(sampleData);
    return this.print(receipt.buffer);
  }
}

// ==========================================
// 4. Printer Manager (Orchestrator)
// ==========================================
export class PrinterManager extends EventEmitter implements IPrinter {
  private activePrinter: IPrinter;
  readonly type: PrinterType;

  constructor(private readonly config: AppConfig) {
    super();
    this.type = config.printerType;

    switch (config.printerType) {
      case 'network':
        this.activePrinter = new NetworkPrinter(
          config.printerIp,
          config.printerPort,
          config.reconnectInterval,
          (status, error) => this.emit('status-change', status, error)
        );
        break;
      case 'usb':
        this.activePrinter = new UsbPrinter((status, error) =>
          this.emit('status-change', status, error)
        );
        break;
      case 'console':
      default:
        this.activePrinter = new ConsolePrinter();
        break;
    }
  }

  async connect(): Promise<void> {
    log.info(`Initializing printer manager with mode: ${this.activePrinter.type.toUpperCase()}`);
    await this.activePrinter.connect();
    this.emit('status-change', this.activePrinter.getStatus());
  }

  async disconnect(): Promise<void> {
    await this.activePrinter.disconnect();
    this.emit('status-change', 'disconnected');
  }

  getStatus(): PrinterStatus {
    return this.activePrinter.getStatus();
  }

  async print(buffer: Buffer, plainTextPreview?: string): Promise<boolean> {
    return this.activePrinter.print(buffer, plainTextPreview);
  }

  async testPrint(): Promise<boolean> {
    return this.activePrinter.testPrint();
  }
}

export default PrinterManager;
