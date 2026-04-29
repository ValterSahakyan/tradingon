import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { HyperliquidPosition } from '../common/types';

interface AssetMeta {
  index: number;
  szDecimals: number;
}

interface OrderWire {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: { limit: { tif: string } };
}

interface FillResult {
  oid: number;
  status: 'filled' | 'resting' | 'rejected';
  avgPx?: number;
  totalSz?: number;
}

@Injectable()
export class HyperliquidClient implements OnModuleInit {
  private readonly logger = new Logger(HyperliquidClient.name);
  private readonly http: AxiosInstance;
  private readonly apiUrl: string;
  private readonly isMainnet: boolean;
  private wallet: ethers.Wallet | null = null;
  private assets = new Map<string, AssetMeta>();

  // Prevent concurrent closes on the same coin
  private closingInFlight = new Set<string>();

  constructor(private readonly config: ConfigService) {
    this.isMainnet = !config.get<boolean>('hyperliquid.testnet');
    this.apiUrl = config.get<string>('hyperliquid.apiUrl');
    this.http = axios.create({ baseURL: this.apiUrl, timeout: 15_000 });
  }

  async onModuleInit() {
    const pk = this.config.get<string>('hyperliquid.privateKey');
    if (!pk) {
      this.logger.error('HYPERLIQUID_PRIVATE_KEY not set — execution disabled');
      return;
    }
    this.wallet = new ethers.Wallet(pk);
    this.logger.log(`Wallet: ${this.wallet.address} | Network: ${this.isMainnet ? 'MAINNET' : 'testnet'}`);
    await this.loadAssetMeta();
  }

  // ─── Public API ────────────────────────────────────────────────

  async placeMarketOrder(
    coin: string,
    isBuy: boolean,
    sz: number,
    reduceOnly = false,
  ): Promise<FillResult | null> {
    const asset = this.assets.get(coin);
    if (!asset) { this.logger.error(`Unknown asset: ${coin}`); return null; }

    const midPrice = await this.getMidPrice(coin);
    if (midPrice <= 0) { this.logger.error(`Zero mid price for ${coin}`); return null; }

    // 0.5% slippage buffer — meme tokens are volatile
    const slippage = 0.005;
    const limitPx = isBuy ? midPrice * (1 + slippage) : midPrice * (1 - slippage);

    const wire: OrderWire = {
      a: asset.index,
      b: isBuy,
      p: this.fmtPrice(limitPx),
      s: this.fmtSize(sz, asset.szDecimals),
      r: reduceOnly,
      t: { limit: { tif: 'Ioc' } },
    };

    return this.sendOrder([wire]);
  }

  async placeLimitOrder(
    coin: string,
    isBuy: boolean,
    sz: number,
    limitPx: number,
    reduceOnly = false,
    tif: 'Gtc' | 'Ioc' | 'Alo' = 'Gtc',
  ): Promise<FillResult | null> {
    const asset = this.assets.get(coin);
    if (!asset) { this.logger.error(`Unknown asset: ${coin}`); return null; }

    const wire: OrderWire = {
      a: asset.index,
      b: isBuy,
      p: this.fmtPrice(limitPx),
      s: this.fmtSize(sz, asset.szDecimals),
      r: reduceOnly,
      t: { limit: { tif } },
    };

    return this.sendOrder([wire]);
  }

  async cancelOrder(coin: string, oid: number): Promise<boolean> {
    const asset = this.assets.get(coin);
    if (!asset) return false;
    const action = { type: 'cancel', cancels: [{ a: asset.index, o: oid }] };
    try {
      const { sig, nonce } = await this.signL1Action(action);
      const res = await this.http.post('/exchange', { action, nonce, signature: sig, vaultAddress: null });
      return res.data?.status === 'ok';
    } catch (err) {
      this.logger.error(`Cancel failed: ${err.message}`);
      return false;
    }
  }

  async setLeverage(coin: string, leverage: number): Promise<void> {
    const asset = this.assets.get(coin);
    if (!asset) return;
    const action = { type: 'updateLeverage', asset: asset.index, isCross: false, leverage };
    try {
      const { sig, nonce } = await this.signL1Action(action);
      await this.http.post('/exchange', { action, nonce, signature: sig, vaultAddress: null });
    } catch (err) {
      this.logger.warn(`setLeverage failed for ${coin}: ${err.message}`);
    }
  }

  isClosing(coin: string): boolean {
    return this.closingInFlight.has(coin);
  }

  markClosing(coin: string): void {
    this.closingInFlight.add(coin);
  }

  clearClosing(coin: string): void {
    this.closingInFlight.delete(coin);
  }

  async getOpenPositions(): Promise<HyperliquidPosition[]> {
    if (!this.wallet) return [];
    try {
      const res = await this.http.post('/info', {
        type: 'clearinghouseState',
        user: this.wallet.address,
      });
      return (res.data?.assetPositions ?? [])
        .map((ap: any) => ap.position)
        .filter((p: any) => p && parseFloat(p.szi) !== 0);
    } catch (err) {
      this.logger.error(`getOpenPositions failed: ${err.message}`);
      return [];
    }
  }

  async getAccountValue(): Promise<number> {
    if (!this.wallet) return 0;
    try {
      const res = await this.http.post('/info', {
        type: 'clearinghouseState',
        user: this.wallet.address,
      });
      return parseFloat(res.data?.marginSummary?.accountValue ?? '0');
    } catch {
      return 0;
    }
  }

  async getMidPrice(coin: string): Promise<number> {
    try {
      const res = await this.http.post('/info', { type: 'allMids' });
      const mids: Record<string, string> = res.data ?? {};
      return parseFloat(mids[coin] ?? '0');
    } catch {
      return 0;
    }
  }

  getSzDecimals(coin: string): number {
    return this.assets.get(coin)?.szDecimals ?? 4;
  }

  // ─── Signing (Hyperliquid L1 EIP-712 spec) ────────────────────

  private async signL1Action(
    action: Record<string, any>,
    vaultAddress: string | null = null,
  ): Promise<{ sig: string; nonce: number }> {
    if (!this.wallet) throw new Error('Wallet not initialised');

    const nonce = Date.now();
    const connectionId = this.buildConnectionId(action, vaultAddress, nonce);

    const domain = {
      chainId: 1337,
      name: 'Exchange',
      verifyingContract: '0x0000000000000000000000000000000000000000',
      version: '1',
    };

    const types = {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    };

    const message = {
      source: this.isMainnet ? 'a' : 'b',
      connectionId,
    };

    const sig = await this.wallet._signTypedData(domain, types, message);
    return { sig, nonce };
  }

  private buildConnectionId(
    action: Record<string, any>,
    vaultAddress: string | null,
    nonce: number,
  ): string {
    const actionBytes = msgpackEncode(action);

    // 8 bytes nonce (big-endian) + 1 byte vault flag [+ 20 bytes vault addr]
    const extra = vaultAddress ? 29 : 9;
    const buf = new Uint8Array(actionBytes.length + extra);
    buf.set(actionBytes, 0);

    const view = new DataView(buf.buffer, actionBytes.length, 8);
    view.setBigUint64(0, BigInt(nonce), false); // big-endian

    if (vaultAddress) {
      buf[actionBytes.length + 8] = 1;
      const addrBytes = ethers.utils.arrayify(vaultAddress);
      buf.set(addrBytes, actionBytes.length + 9);
    } else {
      buf[actionBytes.length + 8] = 0;
    }

    return ethers.utils.keccak256(buf);
  }

  // ─── Order sending ────────────────────────────────────────────

  private async sendOrder(orders: OrderWire[]): Promise<FillResult | null> {
    const action = { type: 'order', orders, grouping: 'na' };
    try {
      const { sig, nonce } = await this.signL1Action(action);
      const res = await this.http.post('/exchange', {
        action,
        nonce,
        signature: sig,
        vaultAddress: null,
      });

      const statuses: any[] = res.data?.response?.data?.statuses ?? [];
      const first = statuses[0];

      if (first?.filled) {
        return {
          oid: first.filled.oid,
          status: 'filled',
          avgPx: parseFloat(first.filled.avgPx ?? '0'),
          totalSz: parseFloat(first.filled.totalSz ?? '0'),
        };
      }
      if (first?.resting) {
        return { oid: first.resting.oid, status: 'resting' };
      }
      if (first?.error) {
        this.logger.error(`Order error: ${first.error}`);
        return null;
      }
      this.logger.warn(`Unexpected order response: ${JSON.stringify(res.data)}`);
      return null;
    } catch (err) {
      this.logger.error(`sendOrder failed: ${err.message}`);
      return null;
    }
  }

  // ─── Asset meta ───────────────────────────────────────────────

  private async loadAssetMeta(attempt = 1): Promise<void> {
    try {
      const res = await this.http.post('/info', { type: 'meta' });
      const universe: any[] = res.data?.universe ?? [];
      universe.forEach((asset, idx) => {
        this.assets.set(asset.name, {
          index: idx,
          szDecimals: asset.szDecimals ?? 4,
        });
      });
      this.logger.log(`Loaded ${this.assets.size} assets`);
    } catch (err) {
      const is429 = err?.response?.status === 429 || err.message?.includes('429');
      if (attempt <= 5) {
        const delay = Math.min(2000 * attempt, 10_000); // 2s, 4s, 6s, 8s, 10s
        this.logger.warn(`loadAssetMeta attempt ${attempt} failed (${err.message}) — retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return this.loadAssetMeta(attempt + 1);
      }
      this.logger.error(`loadAssetMeta failed after ${attempt} attempts: ${err.message}`);
    }
  }

  // ─── Formatting ───────────────────────────────────────────────

  // Hyperliquid: max 6 significant figures, no scientific notation
  fmtPrice(price: number): string {
    if (price === 0) return '0';
    const sig = parseFloat(price.toPrecision(5));
    // toPrecision can produce scientific notation for very small numbers
    if (sig.toString().includes('e')) {
      // Manual fixed-point conversion
      const str = sig.toFixed(20);
      // Trim trailing zeros but keep at least one decimal
      return str.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.0');
    }
    return sig.toString();
  }

  fmtSize(sz: number, szDecimals: number): string {
    return sz.toFixed(szDecimals);
  }
}
