import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';
import { InterfaceAbi } from 'ethers';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/** Reads a required environment variable or exits with a precise message. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Environment variable ${name} is not set. See .env.example.`);
  }
  return value.trim();
}

export function requireAddress(name: string): string {
  const value = requireEnv(name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Environment variable ${name} is not a valid address: ${value}`);
  }
  return value;
}

export function requirePrivateKey(name: string): string {
  const value = requireEnv(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Environment variable ${name} must be a 0x-prefixed 32-byte private key.`);
  }
  return value;
}

export function requireNumber(name: string): number {
  const raw = requireEnv(name);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} is not a number: ${raw}`);
  }
  return value;
}

/**
 * Loads a contract ABI from the Foundry build output, so the scripts can never drift
 * from the compiled contracts. Run `forge build` first.
 */
export function loadAbi(contractName: string): InterfaceAbi {
  const artifact = path.resolve(__dirname, '..', 'out', `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(artifact)) {
    throw new Error(`Missing build artifact for ${contractName} at ${artifact}. Run \`forge build\` first.`);
  }
  return JSON.parse(fs.readFileSync(artifact, 'utf8')).abi as InterfaceAbi;
}

/** bytes32 device id from a short ASCII label, e.g. "NODE-001". */
export function toDeviceId(label: string): string {
  const bytes = Buffer.from(label, 'utf8');
  if (bytes.length > 32) {
    throw new Error(`Device label "${label}" exceeds 32 bytes`);
  }
  return '0x' + Buffer.concat([bytes, Buffer.alloc(32 - bytes.length)]).toString('hex');
}
