import fs from 'fs/promises';
import * as fss from 'fs';
import axios from 'axios';
import { createClient } from './client'
import { Address, Hex } from 'viem';
import path from 'path';
import 'dotenv/config';

type SupportedChain =
	'1' |
	'10' |
	'56' |
	'137' |
	'1101' |
	'8543' |
	'42161' |
	'43114' |
	'42220' |
	'534352' |
	'11155111';

function isValidJSON(jsonString: string): boolean {
	try {
		JSON.parse(jsonString);
		return true;
	} catch (error) {
		return false;
	}
}

// Gets the source code of a contract (and its ABI) if the contract was verified on etherscan
export async function getSourceCode(chainId: string | number, tokenName: string, tokenAddress: Address) {
	const dir = path.basename(path.dirname(__dirname));
	const srcDir = (dir === 'src' ? '.' : './src');
	const tokenDir = `${tokenName.toLowerCase()}-${chainId}`;
	const sourcePath = `${srcDir}/sources/${tokenDir}`;

	let sourceCode = '';
	let compilerVersion = '';
	let abi = '';
	let contractName = '';
	let bytecode = '';

	if (fss.existsSync(sourcePath)) {
		console.log("Found existing source info, skipping fetch....")


		if (fss.existsSync(`${sourcePath}/${tokenName}.sol`)) {
			sourceCode = (await fs.readFile(`${sourcePath}/${tokenName}.sol`)).toString();
		}

		if (fss.existsSync(`${sourcePath}/compilerversion`)) {
			compilerVersion = (await fs.readFile(`${sourcePath}/compilerversion`)).toString();
		}

		if (fss.existsSync(`${sourcePath}/abi.json`)) {
			abi = JSON.parse((await fs.readFile(`${sourcePath}/abi.json`)).toString());
		}

		if (fss.existsSync(`${sourcePath}/contractname`)) {
			contractName = (await fs.readFile(`${sourcePath}/contractname`)).toString();
		}

		if (fss.existsSync(`${sourcePath}/bytecode`)) {
			bytecode = (await fs.readFile(`${sourcePath}/bytecode`)).toString();
		}

		return [contractName, compilerVersion, sourceCode, abi, bytecode];
	}

	const BASE_API_URL = {
		'1': 'api.etherscan.io',
		'10': 'api-optimistic.etherscan.io',
		'56': 'api.bscscan.com',
		'137': 'api.polygonscan.com',
		'1101': 'api-zkevm.polygonscan.com',
		'8543': 'api.basescan.org',
		'42161': 'api.arbiscan.io',
		'42220': 'api.celoscan.io',
		'43114': 'api.routescan.io/v2/network/mainnet/evm/43114/etherscan',
		'534352': 'api.scrollscan.com',
		'11155111': 'api-sepolia.etherscan.io',
	}

	const API_KEYS = {
		'1': process.env.ETHERSCAN_APIKEY,
		'10': process.env.OPTIMISM_APIKEY,
		'56': process.env.BSC_APIKEY,
		'137': process.env.POLYGON_APIKEY,
		'1101': process.env.ZKPOLYGON_APIKEY,
		'8543': process.env.BASE_APIKEY,
		'42161': process.env.ARB_APIKEY,
		'42220': process.env.CELO_APIKEY,
		'43114': process.env.AVALANCHE_APIKEY,
		'534352': process.env.SCROLL_APIKEY,
		'11155111': process.env.SEPOLIA_APIKEY,
	}

	if (!BASE_API_URL[chainId.toString() as SupportedChain]) {
		console.log("Chain not supported, skipping source code fetch....")
		return [sourceCode,
			compilerVersion,
			abi,
			contractName,
			bytecode,];
	}

	const etherscanSourceCodeUrl = `https://${BASE_API_URL[chainId.toString() as SupportedChain]}/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${API_KEYS[chainId.toString() as SupportedChain]}`;

	let response;
	try {
		response = await axios({
			method: "get",
			url: etherscanSourceCodeUrl,
		});
	} catch (err) {
		console.log('Error fetching source code, skipping...')
		return [sourceCode,
			compilerVersion,
			abi,
			contractName,
			bytecode,];
	}

	sourceCode = response.data.result[0].sourceCode
	abi = response.data.result[0].ABI
	compilerVersion = response.data.result[0].compilerVersion
	contractName = response.data.result[0].contractName

	const publicClient = await createClient(chainId);
	bytecode = await publicClient.getBytecode({ address: tokenAddress }) || '';

	if (sourceCode) {
		await fs.mkdir(`${srcDir}/sources/${tokenDir}`, { recursive: true });
		await fs.writeFile(`${srcDir}/sources/${tokenDir}/${tokenName}.sol`, sourceCode)
	} else {
		console.log('No source code found')
		sourceCode = '';
	}

	if (abi && isValidJSON(abi)) {
		await fs.mkdir(`${srcDir}/sources/${tokenDir}`, { recursive: true });
		await fs.writeFile(`${srcDir}/sources/${tokenDir}/abi.json`, abi)
		abi = JSON.parse(abi.toString());
	} else {
		console.log('No abi found')
		abi = '';
	}

	if (contractName) {
		await fs.mkdir(`${srcDir}/sources/${tokenDir}`, { recursive: true });
		await fs.writeFile(`${srcDir}/sources/${tokenDir}/contractname`, contractName)
	} else {
		console.log('No Contract Name found')
		contractName = '';
	}

	if (compilerVersion) {
		await fs.mkdir(`${srcDir}/sources/${tokenDir}`, { recursive: true });
		await fs.writeFile(`${srcDir}/sources/${tokenDir}/compilerversion`, compilerVersion)
	} else {
		console.log('No Compiler version found')
		compilerVersion = '';
	}

	if (bytecode) {
		await fs.mkdir(`${srcDir}/sources/${tokenDir}`, { recursive: true });
		await fs.writeFile(`${srcDir}/sources/${tokenDir}/bytecode`, bytecode.toString())
	} else {
		console.log('No bytecode found')
		bytecode = '' as Hex;
	}

	return [contractName, compilerVersion, sourceCode, abi, bytecode]
}
