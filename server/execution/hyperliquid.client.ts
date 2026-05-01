import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { AppConfigService } from '../config/app-config.service';
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
  private http: AxiosInstance | null = null;
  private isMainnet = false;
  private httpReady = false;   // set once — HTTP client never changes
  private wallet: ethers.Wallet | null = null;
  private accountAddress: string | null = null;
  private accountAbstraction: string | null = null;
  private assets = new Map<string, AssetMeta>();
  private assetsLoading: Promise<void> | null = null;
  private closingInFlight = new Set<string>();
  private cachedAccountValue: number | null = null;
  private cachedAccountValueAt = 0;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit() {
    void this.ensureConfigured();
  }

  async placeMarketOrder(
    coin: string,
    isBuy: boolean,
    sz: number,
    reduceOnly = false,
  ): Promise<FillResult | null> {
    if (!await this.ensureReady()) {
      this.logger.error(`Client not ready — private key not loaded or assets not fetched (coin: ${coin})`);
      return null;
    }
    const asset = this.assets.get(coin);
    if (!asset) {
      this.logger.error(`Unknown asset: ${coin}`);
      return null;
    }

    const midPrice = await this.getMidPrice(coin);
    if (midPrice <= 0) {
      this.logger.error(`Zero mid price for ${coin}`);
      return null;
    }

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
    if (!asset) {
      this.logger.error(`Unknown asset: ${coin}`);
      return null;
    }

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
    const http = await this.getHttp();
    const asset = this.assets.get(coin);
    if (!http || !asset) {
      return false;
    }

    const vaultAddress = this.getVaultAddress();
    const action = { type: 'cancel', cancels: [{ a: asset.index, o: oid }] };
    try {
      const { sig, nonce } = await this.signL1Action(action, vaultAddress);
      const res = await http.post('/exchange', { action, nonce, signature: sig, vaultAddress });
      return res.data?.status === 'ok';
    } catch (err) {
      this.logger.error(`Cancel failed: ${err.message}`);
      return false;
    }
  }

  async setLeverage(coin: string, leverage: number): Promise<void> {
    if (!await this.ensureReady()) return;
    const http = this.http!;
    const asset = this.assets.get(coin);
    if (!asset) {
      return;
    }

    const vaultAddress = this.getVaultAddress();
    const action = { type: 'updateLeverage', asset: asset.index, isCross: false, leverage };
    try {
      const { sig, nonce } = await this.signL1Action(action, vaultAddress);
      await http.post('/exchange', { action, nonce, signature: sig, vaultAddress });
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
    const http = await this.getHttp();
    if (!http || !this.wallet) {
      return [];
    }

    try {
      const res = await http.post('/info', {
        type: 'clearinghouseState',
        user: this.accountAddress ?? this.wallet.address,
      });
      return (res.data?.assetPositions ?? [])
        .map((ap: any) => ap.position)
        .filter((p: any) => p && parseFloat(p.szi) !== 0);
    } catch (err) {
      this.logger.error(`getOpenPositions failed: ${err.message}`);
      return [];
    }
  }

  async getAccountValue(): Promise<number | null> {
    const http = await this.getHttp();
    if (!http) {
      this.logger.warn('getAccountValue: HTTP client not ready (API URL not configured)');
      return this.cachedAccountValue;
    }
    if (!this.wallet) {
      this.logger.warn('getAccountValue: wallet is null — HYPERLIQUID_PRIVATE_KEY not loaded');
      return null;
    }

    const queryAddress = this.accountAddress ?? this.wallet.address;
    this.logger.log(`getAccountValue: querying address=${queryAddress} walletAddress=${this.wallet.address} accountAddress=${this.accountAddress ?? 'null'} accountAbstraction=${this.accountAbstraction ?? 'not-yet-fetched'}`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.ensureAccountAbstraction();
        this.logger.log(`getAccountValue attempt ${attempt}: accountAbstraction=${this.accountAbstraction ?? 'none'} usesUnified=${this.usesUnifiedCollateral()}`);

        const [perpRes, spotRes] = await Promise.all([
          http.post('/info', { type: 'clearinghouseState', user: queryAddress }),
          http.post('/info', { type: 'spotClearinghouseState', user: queryAddress }),
        ]);

        this.logger.log(`RAW clearinghouseState: ${JSON.stringify(perpRes.data)}`);
        this.logger.log(`RAW spotClearinghouseState: ${JSON.stringify(spotRes.data)}`);

        const perpValue = parseFloat(perpRes.data?.marginSummary?.accountValue ?? '0');
        const spotBalances: any[] = spotRes.data?.balances ?? [];
        const spotUsdc = spotBalances.find((b: any) => b.coin === 'USDC');
        const spotTotal = parseFloat(spotUsdc?.total ?? '0');

        this.logger.log(`Balance — perp: $${perpValue.toFixed(2)}, spot USDC: $${spotTotal.toFixed(2)} | marginSummary.accountValue="${perpRes.data?.marginSummary?.accountValue ?? 'missing'}" spotUsdc.total="${spotUsdc?.total ?? 'missing'}"`);
        this.logger.log(`getAccountValue: usesUnifiedCollateral=${this.usesUnifiedCollateral()} — will return ${this.usesUnifiedCollateral() ? `spotTotal=$${spotTotal}` : `perpValue=$${perpValue}`}`);

        if (this.usesUnifiedCollateral()) {
          const value = spotTotal;
          if (Number.isFinite(value)) {
            this.cachedAccountValue = value;
            this.cachedAccountValueAt = Date.now();
            return value;
          }
          return null;
        }

        if (perpValue === 0 && spotTotal === 0) {
          this.logger.warn(
            `Account ${this.accountAddress} has $0 in both perp and spot. ` +
            `If this is an API wallet, set HYPERLIQUID_ACCOUNT_ADDRESS to your main wallet address in the Config Panel.`,
          );
        } else if (perpValue === 0 && spotTotal > 0) {
          this.logger.warn(`Your $${spotTotal.toFixed(2)} USDC is in the spot wallet. Transfer it to the perp account on app.hyperliquid.xyz to enable trading.`);
        }

        const value = perpValue;
        if (Number.isFinite(value)) {
          this.cachedAccountValue = value;
          this.cachedAccountValueAt = Date.now();
          return value;
        }
        return null;
      } catch (err) {
        const isRateLimit = err.response?.status === 429 || /rate.limit/i.test(err.message);
        if (isRateLimit && attempt < 3) {
          const delay = attempt * 2000;
          this.logger.warn(`getAccountValue rate limited — retrying in ${delay}ms (attempt ${attempt}/3)`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        this.logger.warn(`getAccountValue failed: ${err.message}`);
        // Return stale cache (up to 2 minutes old) rather than crashing the scan
        const cacheAge = Date.now() - this.cachedAccountValueAt;
        if (this.cachedAccountValue !== null && cacheAge < 120_000) {
          this.logger.warn(`Using cached account value $${this.cachedAccountValue.toFixed(2)} (${Math.round(cacheAge / 1000)}s old)`);
          return this.cachedAccountValue;
        }
        return null;
      }
    }
    return null;
  }

  async getSpotUsdcBalance(): Promise<number | null> {
    const http = await this.getHttp();
    if (!http) {
      this.logger.warn('getSpotUsdcBalance: HTTP client not ready');
      return null;
    }
    if (!this.wallet) {
      this.logger.warn('getSpotUsdcBalance: wallet not loaded');
      return null;
    }
    const queryAddress = this.accountAddress ?? this.wallet.address;
    try {
      const res = await http.post('/info', { type: 'spotClearinghouseState', user: queryAddress });
      const balances: any[] = res.data?.balances ?? [];
      const usdc = balances.find((b: any) => b.coin === 'USDC');
      const total = parseFloat(usdc?.total ?? '0');
      this.logger.log(`getSpotUsdcBalance: address=${queryAddress} USDC.total="${usdc?.total ?? 'missing'}" parsed=${total}`);
      return Number.isFinite(total) ? total : null;
    } catch (err) {
      this.logger.warn(`getSpotUsdcBalance failed: ${err.message}`);
      return null;
    }
  }

  getWalletAddress(): string | null {
    return this.wallet?.address ?? null;
  }

  getAccountAddress(): string | null {
    return this.accountAddress ?? this.wallet?.address ?? null;
  }

  async getMidPrice(coin: string): Promise<number> {
    const http = await this.getHttp();
    if (!http) {
      return 0;
    }

    try {
      const res = await http.post('/info', { type: 'allMids' });
      const mids: Record<string, string> = res.data ?? {};
      return parseFloat(mids[coin] ?? '0');
    } catch {
      return 0;
    }
  }

  getSzDecimals(coin: string): number {
    return this.assets.get(coin)?.szDecimals ?? 4;
  }

  private async signL1Action(
    action: Record<string, any>,
    vaultAddress: string | null = null,
  ): Promise<{ sig: string; nonce: number }> {
    if (!this.wallet) {
      throw new Error('Wallet not initialised');
    }

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
    const extra = vaultAddress ? 29 : 9;
    const buf = new Uint8Array(actionBytes.length + extra);
    buf.set(actionBytes, 0);

    const view = new DataView(buf.buffer, actionBytes.length, 8);
    view.setBigUint64(0, BigInt(nonce), false);

    if (vaultAddress) {
      buf[actionBytes.length + 8] = 1;
      const addrBytes = ethers.utils.arrayify(vaultAddress);
      buf.set(addrBytes, actionBytes.length + 9);
    } else {
      buf[actionBytes.length + 8] = 0;
    }

    return ethers.utils.keccak256(buf);
  }

  private async sendOrder(orders: OrderWire[]): Promise<FillResult | null> {
    const http = await this.getHttp();
    if (!http) {
      return null;
    }

    const vaultAddress = this.getVaultAddress();
    const action = { type: 'order', orders, grouping: 'na' };
    try {
      const { sig, nonce } = await this.signL1Action(action, vaultAddress);
      const res = await http.post('/exchange', {
        action,
        nonce,
        signature: sig,
        vaultAddress,
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

  private async loadAssetMeta(attempt = 1): Promise<void> {
    const http = await this.getHttp();
    if (!http) {
      return;
    }

    try {
      const res = await http.post('/info', { type: 'meta' });
      const universe: any[] = res.data?.universe ?? [];
      for (const [idx, asset] of universe.entries()) {
        this.assets.set(asset.name, {
          index: idx,
          szDecimals: asset.szDecimals ?? 4,
        });
      }
      this.logger.log(`Loaded ${this.assets.size} assets`);
    } catch (err) {
      if (attempt <= 5) {
        const delay = Math.min(2000 * attempt, 10_000);
        this.logger.warn(`loadAssetMeta attempt ${attempt} failed (${err.message}) - retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.loadAssetMeta(attempt + 1);
      }
      this.logger.error(`loadAssetMeta failed after ${attempt} attempts: ${err.message}`);
    }
  }

  private async ensureConfigured(): Promise<void> {
    await this.config.waitUntilReady();

    // HTTP client is created once from the API URL (requires restart if URL changes)
    if (!this.httpReady) {
      const apiUrl = this.config.get<string>('hyperliquid.apiUrl');
      if (!apiUrl) {
        this.logger.error('Hyperliquid API URL not configured');
        return;
      }
      this.isMainnet = !this.config.get<boolean>('hyperliquid.testnet');
      this.logger.log(`HyperliquidClient: initialising HTTP client → baseURL=${apiUrl} mainnet=${this.isMainnet}`);
      this.http = axios.create({ baseURL: apiUrl, timeout: 15_000 });
      this.httpReady = true;
    }

    // Wallet init is retried on every call until the key is available in DB.
    // This allows the key to be set via the Config panel without a restart.
    if (!this.wallet) {
      const pk = this.config.get<string>('hyperliquid.privateKey');
      if (!pk) {
        this.logger.warn('HYPERLIQUID_PRIVATE_KEY not found in DB or env — set it in the Config panel');
        return;
      }
      try {
        this.wallet = new ethers.Wallet(pk.trim());
        const manualAddr = this.config.get<string>('hyperliquid.accountAddress');
        const manualLower = manualAddr?.toLowerCase();
        const walletLower = this.wallet.address.toLowerCase();
        if (manualLower && manualLower !== walletLower) {
          // Explicit override that differs from the signing wallet — use it directly
          this.accountAddress = manualLower;
        } else {
          // No override, or it was accidentally set to the API wallet address —
          // auto-discover the master account this API wallet belongs to
          this.accountAddress = await this.discoverMasterAccount(this.wallet.address);
        }
        this.logger.log(`Wallet ready: ${this.wallet.address} | Account: ${this.accountAddress} | Network: ${this.isMainnet ? 'MAINNET' : 'testnet'}`);
      } catch (err) {
        this.logger.error(`HYPERLIQUID_PRIVATE_KEY is invalid (${err.message}) — must be a 0x-prefixed 64-char hex private key. Update it in the Config panel.`);
        return;
      }
    }

    // Load assets once after wallet is initialized. Guard against concurrent loads.
    if (this.assets.size === 0 && !this.assetsLoading) {
      this.assetsLoading = this.loadAssetMeta().finally(() => {
        this.assetsLoading = null;
      });
    }
    if (this.assetsLoading) {
      await this.assetsLoading;
    }
  }

  private async discoverMasterAccount(agentAddress: string): Promise<string> {
    if (!this.http) return agentAddress.toLowerCase();

    // Try to find the master account this API wallet belongs to.
    // Hyperliquid stores the agent→master mapping; we try a few known endpoint shapes.
    const candidates: Array<() => Promise<string | null>> = [
      async () => {
        const res = await this.http!.post('/info', { type: 'agentAddress', user: agentAddress });
        this.logger.log(`agentAddress raw: ${JSON.stringify(res.data)}`);
        const addr = typeof res.data === 'string' ? res.data.trim()
          : (res.data?.master ?? res.data?.address ?? null);
        return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(addr) ? addr : null;
      },
      async () => {
        const res = await this.http!.post('/info', { type: 'masterAddress', user: agentAddress });
        this.logger.log(`masterAddress raw: ${JSON.stringify(res.data)}`);
        const addr = typeof res.data === 'string' ? res.data.trim()
          : (res.data?.master ?? res.data?.address ?? null);
        return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(addr) ? addr : null;
      },
    ];

    for (const attempt of candidates) {
      try {
        const master = await attempt();
        if (master && master.toLowerCase() !== agentAddress.toLowerCase()) {
          this.logger.log(`Auto-discovered master account: ${master}`);
          return master.toLowerCase();
        }
      } catch {
        // try next
      }
    }

    this.logger.warn(
      `API wallet ${agentAddress} has no balance — balance lives on your main account. ` +
      `Set HYPERLIQUID_ACCOUNT_ADDRESS to your main wallet address in the Config Panel.`,
    );
    return agentAddress.toLowerCase();
  }

  private async ensureAccountAbstraction(): Promise<void> {
    if (this.accountAbstraction || !this.http || !this.wallet) {
      return;
    }

    try {
      const res = await this.http.post('/info', {
        type: 'userAbstraction',
        user: this.accountAddress ?? this.wallet.address,
      });
      this.logger.log(`userAbstraction raw response: ${JSON.stringify(res.data)}`);
      let abstraction: string | null = null;
      if (typeof res.data === 'string') {
        abstraction = res.data;
      } else if (res.data && typeof res.data === 'object') {
        abstraction = res.data.type ?? res.data.abstraction ?? null;
      }
      this.accountAbstraction = abstraction;
      this.logger.log(`Account abstraction: ${abstraction ?? 'none (standard account)'}`);
    } catch (err) {
      this.logger.warn(`userAbstraction lookup failed: ${err.message}`);
    }
  }

  private usesUnifiedCollateral(): boolean {
    return this.accountAbstraction === 'unifiedAccount' || this.accountAbstraction === 'portfolioMargin';
  }

  private getVaultAddress(): string | null {
    if (!this.wallet || !this.accountAddress) {
      return null;
    }

    return this.accountAddress !== this.wallet.address.toLowerCase() ? this.accountAddress : null;
  }

  private async getHttp(): Promise<AxiosInstance | null> {
    await this.ensureConfigured();
    return this.http;
  }

  private async ensureReady(): Promise<boolean> {
    await this.ensureConfigured();
    return this.http !== null && this.wallet !== null && this.assets.size > 0;
  }

  fmtPrice(price: number): string {
    if (price === 0) {
      return '0';
    }

    const sig = parseFloat(price.toPrecision(5));
    if (sig.toString().includes('e')) {
      const str = sig.toFixed(20);
      return str.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.0');
    }

    return sig.toString();
  }

  fmtSize(sz: number, szDecimals: number): string {
    return sz.toFixed(szDecimals);
  }
}
