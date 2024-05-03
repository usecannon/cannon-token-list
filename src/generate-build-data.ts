import { ChainArtifacts, ChainBuilderRuntime, ChainDefinition, ContractArtifact, DeploymentInfo, IPFSLoader, build, createInitialContext } from "@usecannon/builder";
import fs from 'fs/promises'
import { TokenInfo, TokenList } from "@uniswap/token-lists";
import { deploySchema } from "@usecannon/builder/dist/schemas";
import { Abi, Address, Hex } from "viem";
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
	console.log(`=================== GENERATING BUILD FOR ${tokenInfo.name} AT CHAIN ID ${chainId} =======================`)

	const tokenSchema: DeploymentInfo = JSON.parse(await fs.readFile(`${srcDir}/schemas/mintable-token-deployment-schema.json`, 'utf8'));
	const sourceSchema: any = JSON.parse(await fs.readFile(`${srcDir}/schemas/mintable-token-source-schema.json`, 'utf8'));

	let tokenSchemaString = JSON.stringify(tokenSchema)

	// Transform DeploymentInfo JSON
	let transformedSchema = tokenSchemaString
		.replace(/MintableToken/g, tokenInfo.name)
		.replace('18', tokenInfo.decimals.toString())
		.replace('TKN', tokenInfo.symbol)
		.replace(/0x429069B559753E2949745b31fCb34519650455Fc/g, address)
	transformedSchema = transformedSchema
		.replace(/mintable-token/g, tokenInfo.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
	let deployInfo: DeploymentInfo = JSON.parse(transformedSchema);

	// Transform source code info JSON
	let sourceSchemaString = JSON.stringify(sourceSchema);
	let transformedSourceSchema = sourceSchemaString
		.replace(/MintableToken/g, tokenInfo.name)

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

		const [deployInfo, sourceCodeInfo] = await createDeployInfo(tokenInfo, tokenInfo.chainId, tokenInfo.address as Address);

		if (!deployInfo) {
			continue;
		}

		const sourceInfo = await getContractSourceInfo(deployInfo, tokenInfo.chainId, tokenInfo.name, tokenInfo.address as Address);

		const cannonDeployInfo = await generateLocalBuilds(deployInfo, tokenInfo, sourceCodeInfo);
		
		await publishToIpfs(cannonDeployInfo, sourceCodeInfo, tokenInfo.symbol, 13370)
		
		// If we are able to retrieve the source info from etherscan, we replace the default ERC20 one with it.
		const contractArtifact = deployInfo.state[`deploy.Token`].artifacts.contracts![tokenInfo.name];
		deployInfo.state[`deploy.Token`].artifacts.contracts![tokenInfo.name] = { ...contractArtifact, ...sourceInfo }

		await publishToIpfs(deployInfo, sourceInfo, tokenInfo.symbol, tokenInfo.chainId);

		const extensions = tokenInfo.extensions!;
		for (let extension in extensions) {
			for (let chainId in extensions[`${extension}`] as BridgeInfo) {
				if (Object.prototype.hasOwnProperty.call(extensions[`${extension}`], chainId)) {

					const tokenAddress = Object.values(Object.values(extensions)[0]![chainId as keyof typeof extensions[`${typeof extension}`]])
					const address = tokenAddress[0] as string;

					await createDeployInfo(tokenInfo, parseInt(chainId), address as Address);

					const sourceInfo = await getContractSourceInfo(deployInfo, parseInt(chainId), tokenInfo.name, address as Address);

					await publishToIpfs(deployInfo, sourceInfo, tokenInfo.symbol, tokenInfo.chainId);
				}
			}
		}
	}


}

generateBuilds()