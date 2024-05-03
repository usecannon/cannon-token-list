import { PublicClient, createPublicClient, createTestClient, http, extractChain, Chain } from 'viem'
import * as viem from 'viem';
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

    if (chain) return chain;

    return {
        id,
        name: 'Unknown Network',
        nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
        },
        rpcUrls: { default: { http: [] } },
    };
}

export function createClient(chainId: number | string) {
    return createPublicClient({
        chain: getChainById(parseInt(chainId.toString())),
        transport: http(process.env.CANNON_PROVIDER_URL  || 'http://localhost:8545')
    }) as PublicClient
}

export function createCannonClient() {
    return createTestClient({
        chain: cannonChain,
        mode: 'anvil',
        transport: http(process.env.CANNON_PROVIDER_URL || 'http://localhost:8545')
    }).extend(viem.publicActions).extend(viem.walletActions);
}