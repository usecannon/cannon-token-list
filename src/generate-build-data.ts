import { ChainArtifacts, ChainBuilderRuntime, ChainDefinition, ContractArtifact, DeploymentInfo, IPFSLoader, build, createInitialContext } from "@usecannon/builder";
import fs from 'fs/promises'
import * as fss from 'fs'
import { TokenInfo, TokenList } from "@uniswap/token-lists";
import { deploySchema } from "@usecannon/builder/dist/schemas";
import { Abi, AbiItem, Address, Hex } from "viem";
import { writeIpfs } from "@usecannon/builder/dist/ipfs";
import path from "path";
import { getSourceCode } from "./get-source-info";
import { generateLocalBuilds } from "./generate-local-build-data";

export type BridgeInfo = {
	[destinationChainId: string]: {
		tokenAddress: string;
	}
}

const dir = path.basename(path.dirname(__dirname));
const srcDir = (dir === 'src' ? '.' : 'src');

async function getContractSourceInfo(deployInfo: DeploymentInfo, chainId: number, name: string, address: Address) {
	console.log(`=================== GETTING CONTRACT SOURCE CODE =======================`)

	// GET CONTRACT SOURCE CODE
	const [contractName, compilerVersion, sourceCode, ABI, bytecode] = await getSourceCode(chainId, name, address as Address)

	const sourceInfo: ContractArtifact = {
		sourceName: `src/${contractName || deployInfo.def.name}.sol`,
		contractName: contractName || deployInfo.def.name,
		abi: ABI as unknown as Abi,
		bytecode: bytecode as Hex,
		deployedBytecode: bytecode as Hex,
		linkReferences: {},
		source: {
			solcVersion: compilerVersion,
			input: sourceCode,
		}
	}

	return sourceInfo;
}

async function createDeployInfo(tokenInfo: TokenInfo, chainId: number, address: Address) {
	console.log(`=================== GENERATING BUILD FOR ${tokenInfo.name} AT CHAIN ID ${chainId} =======================`);
	const tokenName = tokenInfo.name.split(' ').join('');

	if (tokenName.length > 31 || tokenName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().length > 31) {
		console.log('Name too long, skipping....')
		return [null, null];
	}

	const tokenSchema: DeploymentInfo = JSON.parse(await fs.readFile(`${srcDir}/schemas/mintable-token-deployment-schema.json`, 'utf8'));
	const sourceSchema: any = JSON.parse(await fs.readFile(`${srcDir}/schemas/mintable-token-source-schema.json`, 'utf8'));

	let tokenSchemaString = JSON.stringify(tokenSchema)

	// Transform DeploymentInfo JSON
	let transformedSchema = tokenSchemaString
		.replace(/MintableToken/g, tokenName)
		.replace('18', tokenInfo.decimals.toString())
		.replace('TKN', tokenInfo.symbol)
		.replace(/0x429069B559753E2949745b31fCb34519650455Fc/g, address)
	transformedSchema = transformedSchema
		.replace(/mintable-token/g, tokenName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
	let deployInfo: DeploymentInfo = JSON.parse(transformedSchema);

	// Transform source code info JSON
	let sourceSchemaString = JSON.stringify(sourceSchema);
	let transformedSourceSchema = sourceSchemaString
		.replace(/MintableToken/g, tokenName)

	let sourceCodeInfo: any = JSON.parse(transformedSourceSchema);

	try {
		// Schema validation 
		deploySchema.parse(deployInfo.def.deploy!['Token']);
	} catch (err) {
		console.log(`Skipping ${tokenInfo.name}, invalid name`);
		// Skips building this but writes deploy info locally, these can still be built after schema has been validated
		await fs.writeFile(`src/deploys/${tokenInfo.name}-deployment.json`, JSON.stringify(deployInfo), 'utf-8')
		return [null, null];
	}

	deployInfo.chainId = chainId

	return [deployInfo as DeploymentInfo, sourceCodeInfo];
}

async function publishToIpfs(deployInfo: DeploymentInfo, sourceInfo: ContractArtifact, symbol: string, chainId: number) {
	console.log(`=================== PUSHING TO IPFS =======================`)

	const deployIpfsHash = await writeIpfs(process.env.IPFS_URL!, deployInfo, {}, false, 30000, 3);
	const miscIpfsHash = await writeIpfs(process.env.IPFS_URL!, sourceInfo, {}, false, 30000, 3);

	deployInfo.miscUrl = `ipfs://${miscIpfsHash}`;

	const deployTag = `${symbol.toLowerCase()}-token_1.0.0_${chainId}-main.txt`
	const metaTag = `${symbol.toLowerCase()}-token_1.0.0_${chainId}-main.meta.txt`

	await fs.writeFile(`${srcDir}/cannondir/tags/${deployTag}`, `ipfs://${deployIpfsHash}`, 'utf-8')
	await fs.writeFile(`${srcDir}/cannondir/tags/${metaTag}`, 'ipfs://QmNg2R3moWLsMLAVKYYzzoHUHjjmXBDnYqphvSCBSBXWsm', 'utf-8')
}

export async function generateBuilds() {
	const tokenList: TokenList = JSON.parse(await fs.readFile(`${srcDir}/tokenlists/multichain-tokenlist.json`, 'utf8'));

	// Convert multichain token list into deploymentinfo 
	for (let tokenInfo of tokenList.tokens) {
		const tokenName = tokenInfo.name.split(' ').join('');

		const [deployInfo, sourceCodeInfo] = await createDeployInfo(tokenInfo, tokenInfo.chainId, tokenInfo.address as Address);

		if (!deployInfo) {
			continue;
		}

		const sourceInfo = await getContractSourceInfo(deployInfo, tokenInfo.chainId, tokenName, tokenInfo.address as Address);

		const [tempAbi, tempSource] = [sourceCodeInfo.artifacts[tokenName].abi, sourceCodeInfo.artifacts[tokenName].source]

		if (sourceInfo.abi && (sourceInfo.abi as any).find((f: any) => f.name === 'balanceOf')) {
			sourceCodeInfo.artifacts[tokenName].abi = sourceInfo.abi;
			sourceCodeInfo.artifacts[tokenName].source = sourceInfo.source;

			// If we are able to retrieve the source info from etherscan, we replace the default ERC20 one with it.
			deployInfo.state[`deploy.Token`].artifacts.contracts!['Token'].abi = sourceInfo.abi
		} else {
			console.log("Source ABI is a proxy ABI, keeping basic ERC20 ABI")
		}

		await publishToIpfs(deployInfo, sourceCodeInfo, tokenInfo.symbol, tokenInfo.chainId);


		// Do local build
		if (await fss.existsSync(`${tokenInfo.symbol.toLowerCase()}-token_1.0.0_13370-main.txt`)) {
			console.log("Skipping cannon build")
		} else {
			sourceCodeInfo.artifacts[tokenName].abi = tempAbi;
			sourceCodeInfo.artifacts[tokenName].source = tempSource;

			const cannonDeployInfo = await generateLocalBuilds(deployInfo, tokenInfo, sourceCodeInfo);

			await publishToIpfs(cannonDeployInfo, sourceCodeInfo, tokenInfo.symbol, 13370)
		}

		// const extensions = tokenInfo.extensions!;
		// for (let extension in extensions) {
		// 	console.log("EXTENSION ======>", extensions[`${extension}`])
		// 	for (let chainId in extensions[`${extension}`] as BridgeInfo) {
		// 		if (Object.prototype.hasOwnProperty.call(extensions[`${extension}`], chainId)) {
		// 			const tokenAddress = Object.values(Object.values(extensions)[0]![chainId as keyof typeof extensions[`${typeof extension}`]])
		// 			const address = tokenAddress[0] as string;

		// 			const [deployInfo] = await createDeployInfo(tokenInfo, parseInt(chainId), address as Address);

		// 			// console.log("CHAIN ID ===>", deployInfo.chainId)
		// 			// console.log("DEPLOY ARTIFACTS ====>", deployInfo.state['deploy.Token'].artifacts)
		// 			// console.log(extensions[`${extension}`])


		// 			if (!deployInfo) {
		// 				continue;
		// 			}

		// 			const sourceInfo = await getContractSourceInfo(deployInfo, parseInt(chainId), tokenName, address as Address);

		// 			// If we are able to retrieve the source info from etherscan, we replace the default ERC20 one with it.
		// 			const contractArtifact = deployInfo.state[`deploy.Token`].artifacts.contracts!['Token'];
		// 			deployInfo.state[`deploy.Token`].artifacts.contracts!['Token'] = { ...contractArtifact, ...sourceInfo }

		// 			await publishToIpfs(deployInfo, sourceInfo, tokenInfo.symbol, parseInt(chainId));
		// 		} else {
		// 			console.log("=======================================>>>>>>>>>")
		// 			console.log("THIS IS THE ELSE", extensions[`${extension}`])
		// 		}
		// 	}
		// }
	}


}

generateBuilds()