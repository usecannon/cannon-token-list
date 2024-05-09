import { chainify } from '@uniswap/token-list-bridge-utils';
import fs from 'fs/promises'
import axios from 'axios';

const TOKEN_LIST = 'https://wispy-bird-88a7.uniswap.workers.dev/?url=http://tokenlist.aave.eth.link';

export async function generateMultichainJSON() {
	const tokenlist = await axios({
		method: "get",
		url: TOKEN_LIST,
	});

	// Make token list multichain (Optimism, arbitrum and polygon)
	const chainifiedList = await chainify(tokenlist.data);

	await fs.writeFile('./src/tokenlists/multichain-tokenlist.json', JSON.stringify(chainifiedList),  'utf8');
}

generateMultichainJSON();