import { ContractArtifact, DeploymentInfo } from "@usecannon/builder";
import fs from 'fs/promises'
import * as fss from 'fs'
import { TokenInfo, TokenList } from "@uniswap/token-lists";
import { deploySchema } from "@usecannon/builder/dist/src/schemas";
import { Abi, Address, Hex } from "viem";
import { writeIpfs } from "@usecannon/builder/dist/src/ipfs";
import path from "path";
import { getSourceCode } from "./get-source-info";
import { generateLocalBuilds } from "./generate-local-build-data";
import { yellow, blue, cyan, green } from 'chalk';

export type BridgeInfo = {
	[destinationChainId: string]: {
		tokenAddress: string;
	}
}

const dir = path.basename(path.dirname(__dirname));
const srcDir = (dir === 'src' ? '.' : './src');

const builtPackages: string[] = [];

async function getContractSourceInfo(deployInfo: DeploymentInfo, chainId: number, name: string, address: Address) {
	console.log(cyan(`=================================== GETTING CONTRACT SOURCE CODE ===================================`))

	// GET CONTRACT SOURCE CODE
	const [contractName, compilerVersion, sourceCode, ABI, bytecode] = await getSourceCode(chainId, name, address as Address)

	const fetchedSourceInfo: ContractArtifact = {
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

	return fetchedSourceInfo;
}

async function createDeployInfo(tokenInfo: TokenInfo, chainId: number, address: Address) {
	console.log(green(`==================== GENERATING BUILD: ${tokenInfo.name} AT CHAIN ID ${chainId} ====================`));
	const tokenName = tokenInfo.name.split(' ').join('');

	if (tokenName.length > 31 || tokenName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().length > 31) {
		console.log('Package Name too long, skipping....')
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
		.replace(/mintable-token/g, `${tokenInfo.symbol.toLowerCase()}-token`);

	let deployInfo: DeploymentInfo = JSON.parse(transformedSchema);

	deployInfo.generator = 'cannon token generator';
	// deployInfo.version = '1.0.0';
	deployInfo.timestamp = Math.floor(Date.now() / 1000);

	// Transform source code info JSON
	let sourceSchemaString = JSON.stringify(sourceSchema);
	let transformedSourceSchema = sourceSchemaString.replace(/MintableToken/g, tokenName);
	
	let tokenSource: any = JSON.parse(transformedSourceSchema);

	try {
		// Schema validation 
		deploySchema.parse(deployInfo.def.deploy!['Token']);
	} catch (err) {
		console.log(err)
		console.log(`Skipping ${tokenInfo.name}, invalid name`);
		// Skips building this but writes deploy info locally, these can still be built after schema has been validated
		await fs.writeFile(`src/deploys/${tokenInfo.name}-deployment.json`, JSON.stringify(deployInfo), 'utf-8')
		return [null, null];
	}

	deployInfo.chainId = chainId;

	return [deployInfo as DeploymentInfo, tokenSource];
}

// Published token deployment info to ipfs url in settings.json or env var
async function publishToIpfs(deployInfo: DeploymentInfo, sourceInfo: ContractArtifact, symbol: string, chainId: number) {
	console.log(blue(`============================== PUSHING ${deployInfo.def.name} TO IPFS ==============================`))

	const sourceIpfsHash = await writeIpfs(process.env.IPFS_URL!, sourceInfo, {}, false, 30000, 3);
	deployInfo.miscUrl = `ipfs://${sourceIpfsHash}`;
	
	const deployIpfsHash = await writeIpfs(process.env.IPFS_URL!, deployInfo, {}, false, 30000, 3);

	const deployTag = `${symbol.toLowerCase()}-token_1.0.0_${chainId}-main.txt`
	const metaTag = `${symbol.toLowerCase()}-token_1.0.0_${chainId}-main.meta.txt`

	// Write deployment hash
	await fs.writeFile(`${srcDir}/cannondir/tags/${deployTag}`, `ipfs://${deployIpfsHash}`, 'utf-8');

	// Write metadata hash
	await fs.writeFile(`${srcDir}/cannondir/tags/${metaTag}`, 'ipfs://QmNg2R3moWLsMLAVKYYzzoHUHjjmXBDnYqphvSCBSBXWsm', 'utf-8')
}

export async function generateBuilds() {
	const tokenList: TokenList = JSON.parse(await fs.readFile(`${srcDir}/tokenlists/multichain-tokenlist.json`, 'utf8'));

	// Convert multichain token list into deploymentinfo 
	for (let tokenInfo of tokenList.tokens) {
		const tokenName = tokenInfo.name.split(' ').join('');

		const [deployInfo, tokenSource] = await createDeployInfo(tokenInfo, tokenInfo.chainId, tokenInfo.address as Address);

		if (!deployInfo) {
			continue;
		}

		const fetchedSourceInfo = await getContractSourceInfo(deployInfo, tokenInfo.chainId, tokenName, tokenInfo.address as Address);

		const [tempAbi, tempSource] = [tokenSource.artifacts[tokenName].abi, tokenSource.artifacts[tokenName].source]

		// If ABI is not from a proxy, we swap it out. Otherwise we keep the mintable token ABI
		if (fetchedSourceInfo.abi && (fetchedSourceInfo.abi as any).find((f: any) => f.name === 'balanceOf')) {
			tokenSource.artifacts[tokenName].abi = fetchedSourceInfo.abi;

			// If we are able to retrieve the source info from etherscan, we replace the default ERC20 one with it.
			deployInfo.state[`deploy.Token`].artifacts.contracts!['Token'].abi = fetchedSourceInfo.abi
		} else {
			console.log("Keeping default ERC20 ABI....")
		}

		await publishToIpfs(deployInfo, tokenSource, tokenInfo.symbol, tokenInfo.chainId);

		builtPackages.push(`${tokenInfo.symbol.toLowerCase()}-token`);

		// Do local build if it hasnt been done already
		if (fss.existsSync(`${srcDir}/cannondir/tags/${tokenInfo.symbol.toLowerCase()}-token_1.0.0_13370-main.txt`)) {
			console.log("Cannon network deployment already exists, Skipping.....")
		} else {
			// Function to check if constructor has no args
			function constructorIsEmpty(abi: any) {
				const constructor = abi.find((entry: any) => entry.type === 'constructor');
				if (!constructor) {
					return true;
				}

				return (constructor.inputs && constructor.inputs.length === 0);
			}

			if (tokenSource.artifacts[tokenName].abi && constructorIsEmpty(tokenSource.artifacts[tokenName].abi)) {
				delete deployInfo.def['deploy']['Token'].args;
				delete deployInfo.def.setting;
			} else {
				tokenSource.artifacts[tokenName].abi = tempAbi;
				tokenSource.artifacts[tokenName].source = tempSource;
			}

			let cannonDeployInfo; 
			try {
				cannonDeployInfo = await generateLocalBuilds(deployInfo, tokenInfo, tokenSource)
				await publishToIpfs(cannonDeployInfo, tokenSource, tokenInfo.symbol, 13370)
			} catch (err) {
				console.log(`Failed to build cannon network package for ${tokenInfo.name}: \n`, err)
			}
		}
	}

	const unique = new Set(builtPackages);
	const dedupedPkgs = Array.from(unique);
	const packagesToRegister: string = dedupedPkgs.join('\n');

	await fs.writeFile(`${srcDir}/cannondir/packages`, packagesToRegister, 'utf-8');
}

generateBuilds();