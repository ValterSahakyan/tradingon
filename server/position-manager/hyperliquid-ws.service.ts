import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket = require('ws');

export interface WsTradeUpdate {
  coin: string;
  price: number;
  szi: number; // signed size
  unrealizedPnl: number;
}

@Injectable()
export class HyperliquidWsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HyperliquidWsService.name);
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private connected = false;
  private lastConnectedAt: number | null = null;
  private lastDisconnectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private lastMidsAt: number | null = null;
  private lastUserFillsAt: number | null = null;
  private lastUserEventsAt: number | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly emitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.config.waitUntilReady();
    this.connect();
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
    this.cleanup();
  }

  private connect() {
    const wsUrl = this.config.get<string>('hyperliquid.wsUrl');
    this.logger.log(`Connecting to ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.connected = true;
      this.lastConnectedAt = Date.now();
      this.logger.log('WebSocket connected');
      this.subscribeToTrades();
      this.startPing();
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch {
        // ignore malformed
      }
    });

    this.ws.on('error', (err) => {
      this.logger.warn(`WebSocket error: ${err.message}`);
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.lastDisconnectedAt = Date.now();
      this.logger.warn('WebSocket disconnected');
      this.cleanup();
      if (!this.isShuttingDown) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5_000);
      }
    });
  }

  private subscribeToTrades() {
    // Subscribe to all mid-prices — most efficient for price monitoring
    const sub = { method: 'subscribe', subscription: { type: 'allMids' } };
    this.ws?.send(JSON.stringify(sub));

    // Subscribe to user fills for position updates
    // Note: requires wallet address which we emit via event after auth
    this.emitter.emit('ws.ready');
  }

  subscribeToUserFills(address: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const sub = {
      method: 'subscribe',
      subscription: { type: 'userFills', user: address },
    };
    this.ws.send(JSON.stringify(sub));

    const subEvents = {
      method: 'subscribe',
      subscription: { type: 'userEvents', user: address },
    };
    this.ws.send(JSON.stringify(subEvents));
  }

  private handleMessage(msg: any) {
    this.lastMessageAt = Date.now();
    if (msg.channel === 'allMids' && msg.data?.mids) {
      this.lastMidsAt = this.lastMessageAt;
      this.emitter.emit('ws.mids', msg.data.mids as Record<string, string>);
    } else if (msg.channel === 'userFills') {
      this.lastUserFillsAt = this.lastMessageAt;
      this.emitter.emit('ws.userFills', msg.data);
    } else if (msg.channel === 'userEvents') {
      this.lastUserEventsAt = this.lastMessageAt;
      this.emitter.emit('ws.userEvents', msg.data);
    }
  }

  getStatus() {
    return {
      connected: this.connected && this.ws?.readyState === WebSocket.OPEN,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      lastMessageAt: this.lastMessageAt,
      lastMidsAt: this.lastMidsAt,
      lastUserFillsAt: this.lastUserFillsAt,
      lastUserEventsAt: this.lastUserEventsAt,
    };
  }

  private startPing() {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, 30_000);
  }

  private cleanup() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) { this.ws.removeAllListeners(); this.ws.terminate(); this.ws = null; }
  }
}
