export interface WalletChallenge {
  nonce: string;
  address: string;
  chainId: number | null;
  message: string;
  expiresAt: number;
}

export interface WalletSessionPayload {
  sub: string;
  iat: number;
  exp: number;
}
