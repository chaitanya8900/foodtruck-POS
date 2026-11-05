import dotenv from 'dotenv';
import path from 'path';
import { PrinterType } from './types';
import { logger } from './logger';

// Load .env from current directory or project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  backendUrl: string;
  agentToken: string;
  businessId: string;
  printerType: PrinterType;
  printerIp: string;
  printerPort: number;
  paperWidth: number;
  reconnectInterval: number;
  maxRetryAttempts: number;
  heartbeatInterval: number;
  logLevel: string;
}

function parsePrinterType(val: string | undefined): PrinterType {
  const normalized = (val || '').toLowerCase().trim();
  if (normalized === 'network' || normalized.startsWith('network')) return 'network';
  if (normalized === 'usb') return 'usb';
  if (normalized === 'console') return 'console';
  return 'console'; // Safe default
}

function parseNumber(val: string | undefined, defaultVal: number): number {
  if (!val) return defaultVal;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

export const config: AppConfig = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:5000',
  agentToken: process.env.AGENT_TOKEN || 'local-print-agent-token',
  businessId: process.env.BUSINESS_ID || 'default-truck',
  printerType: parsePrinterType(process.env.PRINTER_TYPE),
  printerIp: process.env.PRINTER_IP || '192.168.1.100',
  printerPort: parseNumber(process.env.PRINTER_PORT, 9100),
  paperWidth: parseNumber(process.env.PAPER_WIDTH, 80),
  reconnectInterval: parseNumber(process.env.RECONNECT_INTERVAL, 5000),
  maxRetryAttempts: parseNumber(process.env.MAX_RETRY_ATTEMPTS, 3),
  heartbeatInterval: parseNumber(process.env.HEARTBEAT_INTERVAL, 30000),
  logLevel: process.env.LOG_LEVEL || 'info',
};

export function validateConfig(): void {
  const log = logger.child({ module: 'Config' });

  log.info(
    {
      backendUrl: config.backendUrl,
      printerType: config.printerType,
      paperWidth: config.paperWidth,
      printerIp: config.printerType === 'network' ? config.printerIp : undefined,
      printerPort: config.printerType === 'network' ? config.printerPort : undefined,
      businessId: config.businessId || '(not set)',
    },
    'Loaded configuration'
  );

  if (!process.env.AGENT_TOKEN || process.env.AGENT_TOKEN === 'your-print-agent-token') {
    log.warn('AGENT_TOKEN is using default/placeholder value. Update .env for production authorization.');
  }

  if (!process.env.BUSINESS_ID) {
    log.warn('BUSINESS_ID is not explicitly configured in .env. Using default fallback.');
  }

  if (config.paperWidth !== 80 && config.paperWidth !== 58) {
    log.warn(`PAPER_WIDTH is set to ${config.paperWidth}mm. Standard sizes are 80mm or 58mm.`);
  }

  if (config.printerType === 'network') {
    if (!config.printerIp || config.printerPort <= 0 || config.printerPort > 65535) {
      log.error(`Invalid network printer configuration: IP=${config.printerIp}, Port=${config.printerPort}`);
    }
  }
}

export default config;
