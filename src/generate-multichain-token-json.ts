import { chainify } from '@uniswap/token-list-bridge-utils';
import fs from 'fs/promises'
import axios from 'axios';

const ONEINCH_TOKEN_LIST = 'https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/mainnet.json';

export async function generateMultichainJSON() {
	const tokenlist = await axios({
		method: "get",
		url: ONEINCH_TOKEN_LIST,
	});

	// Make token list multichain (Optimism, arbitrum and polygon)
	const chainifiedList = await chainify(tokenlist.data);

	await fs.writeFile('tokenlists/1inch-multichain-tokenlist.json', JSON.stringify(chainifiedList),  'utf8');
}

generateMultichainJSON();