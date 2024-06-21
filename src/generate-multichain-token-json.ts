import { chainify } from '@uniswap/token-list-bridge-utils';
import fs from 'fs/promises'
import axios from 'axios';
import prompts from 'prompts';

export async function generateMultichainJSON() {
	const tokenList = await prompts({
		type: 'text',
		name: 'url',
		message: 'Input the url for the hosted json tokenlist',
		initial: false,
	});


	// We use uniswap default tokens list as the default value 
	let TOKEN_LIST = 'https://tokens.uniswap.org/';
	if (tokenList.url){
		TOKEN_LIST = tokenList.url as string;
	}

	const tokenlist = await axios({
		method: "get",
		url: TOKEN_LIST,
	});

	// Make token list multichain (Optimism, arbitrum and polygon)
	const chainifiedList = await chainify(tokenlist.data);

	await fs.writeFile('./src/tokenlists/multichain-tokenlist.json', JSON.stringify(chainifiedList),  'utf8');
}

generateMultichainJSON();