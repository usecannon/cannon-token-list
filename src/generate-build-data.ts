import { ChainBuilderRuntime, ChainDefinition, ContractArtifact, DeploymentInfo, IPFSLoader, build, createInitialContext } from "@usecannon/builder";
import fs from 'fs/promises'
import { TokenList } from "@uniswap/token-lists";
import { z } from 'zod';
import { deploySchema } from "@usecannon/builder/dist/schemas";
import { CannonRegistry } from "@usecannon/builder/dist";
import { createPublicClient, http, Address } from "viem";
import { writeIpfs } from "@usecannon/builder/dist/ipfs";
import path from "path";
import { getSourceCode } from "./get-source-info";

export type ExtensionData = {
	bridge_info: {
		[destinationChainId: string]: {
			tokenAddress: string;
		}
	}
}

export async function generateBuilds() {
	const dir =  path.basename(path.dirname(__dirname));
	const srcDir = (dir === 'src' ? '.': 'src');

	const tokenSchema: DeploymentInfo = JSON.parse(await fs.readFile(`${srcDir}/schemas/mintable-token-deployment-schema.json`, 'utf8'));
	const tokenList: TokenList = JSON.parse(await fs.readFile(`${srcDir}/tokenlists/1inch-multichain-tokenlist.json`, 'utf8'));

	// Convert multichain token list into deploymentinfo 
	for (let tokenInfo of tokenList.tokens) {
		let tokenSchemaString = JSON.stringify(tokenSchema)

		// Might replace this with a json transformation library (JSONATA for example)
		let transformedSchema = tokenSchemaString
			.replace(/MintableToken/g, tokenInfo.name)
			.replace('18', tokenInfo.decimals.toString())
			.replace('TKN', tokenInfo.symbol)
			.replace(/0x429069B559753E2949745b31fCb34519650455Fc/g, tokenInfo.address)

		transformedSchema = transformedSchema
		.replace(/mintable-token/g, tokenInfo.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
		.replace(/\bToken\b/g, tokenInfo.name)

		let deployInfo: DeploymentInfo = JSON.parse(transformedSchema);

		try {
			// Schema validation 
			deploySchema.parse(deployInfo.def.contract![tokenInfo.name]);
		} catch (err) {
			console.log(`Skipping ${tokenInfo.name}, invalid name`);
			// Skips building this but writes deploy info locally, these can still be built after schema has been validated
			await fs.writeFile(`src/deploys/${tokenInfo.name}-deployment.json`, JSON.stringify(deployInfo), 'utf-8' )
			continue;
		}

		// GET CONTRACT SOURCE CODE
		const [ContractName, CompilerVersion, sourceCode, ABI, bytecode] = await getSourceCode(tokenInfo.name, tokenInfo.address as Address)

		deployInfo.chainId = tokenInfo.chainId

		// If we are able to retrieve their own abi from etherscan, we replace the default ERC20 one with it.
		deployInfo.state[`contract.${tokenInfo.name}`].artifacts.contracts![tokenInfo.name].abi = ABI;

		const sourceInfo: ContractArtifact = {
			sourceName: `src/${ContractName}`,
			contractName: ContractName,
			abi: ABI,
			bytecode,
			deployedBytecode: bytecode,
			linkReferences: {},
			source: {
				solcVersion: CompilerVersion,
				input: sourceCode,
			}
		}

		// console.log(`=================== GENERATING BUILD FOR ${tokenInfo.name} =======================`)

		const ipfsHashUrl = await writeIpfs(process.env.IPFS_URL!, deployInfo, {}, false, 30000, 3);
		const ipfsMiscUrl = await writeIpfs(process.env.IPFS_URL!, sourceInfo, {}, false, 30000, 3);

		deployInfo.miscUrl = ipfsMiscUrl;

		await fs.writeFile(`cannondir/tags/${tokenInfo.name.toLowerCase()}_1.0.0_${tokenInfo.chainId}-main.txt`, ipfsHashUrl, 'utf-8')
		await fs.writeFile(`cannondir/tags/${tokenInfo.name.toLowerCase()}_1.0.0_${tokenInfo.chainId}-main.meta.txt`, 'ipfs://QmNg2R3moWLsMLAVKYYzzoHUHjjmXBDnYqphvSCBSBXWsm', 'utf-8')

		// const extensions = tokenInfo.extensions!;
		// for (let extension in extensions) {
		// 	for(let chainId in extensions[`${extension}`] as any){
		// 		console.log(extensions[`${extension}`]!['1'] as any)
		// 	}
		// }
	}


}

generateBuilds()