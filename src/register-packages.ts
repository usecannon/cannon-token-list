import { CannonStorage, IPFSLoader, OnChainRegistry, getCannonContract } from "@usecannon/builder";
import { Address, Abi, zeroAddress, stringToHex, encodeFunctionData, decodeFunctionData} from "viem";
import { createClient, createWallet } from "./client";
import fs from "fs/promises";
import { privateKeyToAccount } from 'viem/accounts';
import { debug } from "console";

const REGISTRY_PROXY_ADDRESS = '0x8E5C7EFC9636A6A0408A46BB7F617094B81e5dba';

export interface TxData {
  abi: Abi;
  address: Address;
  functionName: string;
  value?: string | bigint | number;
  args?: any[];
}

export async function registerPackages(packageOwner: Address) {
  // Read the contents of the file
  const packages = await fs.readFile('./src/cannondir/packages', 'utf-8');
  // Split the data into an array of strings using newline characters as separators
  const packageNames: string[] = packages.split('\n').map(str => str.trim());

  const OPclient = createClient(10, process.env.OP_URL!);
  const Mainnetclient = createClient(1, process.env.MAINNET_URL!);
  const registry = await getCannonContract({
    package: 'registry:latest@main',
    chainId: 1,
    contractName: 'Proxy',
    storage: new CannonStorage(
      new OnChainRegistry({ address: REGISTRY_PROXY_ADDRESS, provider: OPclient as any }),
      { ipfs: new IPFSLoader(process.env.IPFS_URL!, {}, 30000, 3) })
  });
  // const multicall = await getCannonContract({package: 'trusted-multicall-forwarder', chainId: 1, contractName: 'TrustedMulticallForwarder'});

  let txs: TxData[] = [];
  const registerFee = await Mainnetclient.readContract({ ...registry, functionName: 'registerFee' });
  const registryAbi = JSON.parse(await fs.readFile(`./src/registry.json`, 'utf8'));

  packageNames.forEach((pkg) => {
    const packageHash = stringToHex(pkg, { size: 32 });
    // if (currentPackageOwner = zeroAddress) {
    //   return;
    // }

    console.log("CREATING TRANSACTIONS", pkg)

    txs.push({
      ...registry,
      functionName: 'setPackageOwnership',
      value: registerFee as string,
      args: [packageHash, packageOwner],
    });

    // txs.push({
    //   ...registry,
    //   functionName: 'setAdditionalPublishers',
    //   value: registerFee as string,
    //   args: [packageHash, [], [packageOwner]],
    // })
  })

  const account = privateKeyToAccount(process.env.PRIVATE_KEY! as Address);

  txs.forEach(async (txn) => {
        
    const params = {
      ...txn,
      account: account,
    };

    const simulatedGas = await Mainnetclient.estimateContractGas(params as any);
  
    console.log("SIMULATED GAS", simulatedGas)
  
    console.log("Simulating contract transaction")
    const tx = await Mainnetclient.simulateContract(params as any);
        
    const signer = await createWallet(Mainnetclient, process.env.MAINNET_URL as string)
    tx.request.account = account; 
    console.log("Writing to contract..")
    const hash = await signer.writeContract(tx.request as any);
    console.log("TX has been written")
    
    const receipt = await Mainnetclient.waitForTransactionReceipt({ 
      hash,
      timeout: 200_000,
      retryCount: 3, 
      onReplaced: replacement => console.log(replacement)
    });
    console.log("TX has been waited for")
  
    debug(receipt);
    console.log("TRANSACTION STATUS:", receipt.status)
  }) 
}

registerPackages('0xca7777aB932E8F0b930dE9F0d96f4E9a2a00DdD3');