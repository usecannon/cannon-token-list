import fs from 'fs/promises'
import axios from 'axios';
import { publicClient } from './client'
import { Address } from 'viem';
// Gets the source code of a contract (and its ABI) if the contract was verified on etherscan
export async function getSourceCode(tokenName: string, tokenAddress: Address) {
    const etherscanSourceCodeUrl = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${process.env.ETHERSCAN_API_KEY}`;

	const response = await axios({
		method: "get",
		url: etherscanSourceCodeUrl,
	});

    const sourceCode = response.data.result[0].SourceCode
    const ABI = response.data.result[0].ABI
    const CompilerVersion = response.data.result[0].CompilerVersion
    const ContractName = response.data.result[0].CompilerVersion

    const bytecode = publicClient.getBytecode({address: tokenAddress});

    console.log(response.data.result)
    await fs.mkdir(`./sources/${tokenName.toLowerCase()}/`, { recursive: true });
    await fs.writeFile(`./sources/${tokenName.toLowerCase()}/${tokenName}.sol`, sourceCode)
    await fs.writeFile(`./sources/${tokenName.toLowerCase()}/abi.json`, ABI)

    return [ContractName, CompilerVersion, sourceCode, ABI, bytecode]
}

getSourceCode('0xBitcoinToken', '0xB6eD7644C69416d67B522e20bC294A9a9B405B31');