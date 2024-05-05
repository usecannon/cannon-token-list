import { ChainBuilderRuntime, ChainBuilderRuntimeInfo, ChainDefinition, ContractArtifact, DeploymentInfo, DeploymentState, IPFSLoader, OnChainRegistry, build, createInitialContext } from "@usecannon/builder";
import { createCannonClient } from './client'
import { PublicClient, WalletClient, Address} from 'viem';
import { TokenInfo } from "@uniswap/token-lists";

export const CANNON_DIRECTORY='./src/cannondir/';

export async function generateLocalBuilds(deployInfo: DeploymentInfo, tokenInfo: TokenInfo, sourceInfo: any) {
  const tokenName = tokenInfo.name.split(' ').join('');
  const cannonClient = createCannonClient();
  const cleanSnapshot = await cannonClient.snapshot();

	console.log(`=================== GENERATING BUILD FOR ${tokenInfo.name} AT CHAIN ID 13370 =======================`);

  const contractArtifact: ContractArtifact = sourceInfo.artifacts[tokenName];

  deployInfo.chainId = 13370
  deployInfo.state = {};
  
  const info = {
    provider: cannonClient as PublicClient,
    chainId: deployInfo.chainId,
    async getSigner(addr: Address) {
      // on test network any user can be conjured
      //await provider.impersonateAccount({ address: addr });
      //await provider.setBalance({ address: addr, value: viem.parseEther('10000') });
      return { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', wallet: cannonClient as WalletClient };
    },
    async getArtifact(name: string) {
      return contractArtifact;
    },
    snapshots: true,
    allowPartialDeploy: false,
  } as ChainBuilderRuntimeInfo;

  const onChainRegistry = new OnChainRegistry({
    signer: cannonClient.account,
    provider: cannonClient as any,
    address: '0x8E5C7EFC9636A6A0408A46BB7F617094B81e5dba',
    overrides: {},
  });

  const chainDefinition = new ChainDefinition(deployInfo.def);

  const runtime = new ChainBuilderRuntime(
    info,
    onChainRegistry, 
    {ipfs: new IPFSLoader(process.env.IPFS_URL!, {}, 30000, 3)}
  )

  const initialCtx = await createInitialContext(chainDefinition, {}, deployInfo.chainId!, deployInfo.options);

	const buildResult = await build(runtime, chainDefinition, deployInfo.state, initialCtx);

  if (cleanSnapshot) {
    await cannonClient.revert({ id: cleanSnapshot });
  }

  await cannonClient.snapshot();

  deployInfo.state = buildResult;

  return deployInfo;
}