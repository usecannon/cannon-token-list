import { PublicClient, createPublicClient, createTestClient, createWalletClient, http, extractChain, Chain } from 'viem'
import * as viem from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as viemChains from 'viem/chains';

export const cannonChain: Chain = {
	id: 13370,
	name: 'Cannon Local',
	nativeCurrency: {
		name: 'Ether',
		symbol: 'ETH',
		decimals: 18,
	},
	rpcUrls: { default: { http: ['http://localhost:8545'] } },
};

export const chains: Chain[] = [cannonChain, ...Object.values(viemChains)];

export function getChainById(id: number): Chain {
	const chain = extractChain({
		chains,
		id,
	});

	return chain;
}

export function createClient(chainId: number | string, providerUrl?: string) {
	return createPublicClient({
		chain: getChainById(parseInt(chainId.toString())),
		transport: http(providerUrl || process.env.CANNON_PROVIDER_URL || 'http://localhost:8545')
	}).extend(viem.walletActions) as PublicClient
}

export function createWallet(publicClient: PublicClient, providerUrl: string) {
	return createWalletClient({
		chain: publicClient.chain,
		transport: http(providerUrl),
	});
}

export function createCannonClient() {
	return createTestClient({
		chain: cannonChain,
		mode: 'anvil',
		transport: http(process.env.CANNON_PROVIDER_URL || 'http://localhost:8545'), 
	}).extend(viem.publicActions).extend(viem.walletActions);
}