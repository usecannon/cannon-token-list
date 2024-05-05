import { CannonStorage, IPFSLoader, OnChainRegistry, getCannonContract } from "@usecannon/builder";
import { Address, Abi, zeroAddress, stringToHex, encodeFunctionData} from "viem";
import { createClient, createWallet } from "./client";
import fs from "fs/promises";
import { privateKeyToAccount } from 'viem/accounts';


const MULTICALL_ADDRESS = '0xE2C5658cC5C448B48141168f3e475dF8f65A1e3e';

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
    package: 'registry:2.13.1@main',
    chainId: 1,
    contractName: 'Proxy',
    storage: new CannonStorage(
      new OnChainRegistry({ address: '0x8E5C7EFC9636A6A0408A46BB7F617094B81e5dba', provider: OPclient }),
      { ipfs: new IPFSLoader(process.env.IPFS_URL!, {}, 30000, 3) })
  });
  // const multicall = await getCannonContract({package: 'trusted-multicall-forwarder', chainId: 1, contractName: 'TrustedMulticallForwarder'});

  let txs: TxData[] = [];
  const registerFee = await Mainnetclient.readContract({ ...registry, functionName: 'registerFee' });

  for (let pkg of packageNames) {
    const currentPackageOwner = await Mainnetclient.readContract({ ...registry, functionName: 'getPackageOwner', args: [stringToHex(pkg, { size: 32 })] });

    // if (currentPackageOwner != zeroAddress) {
    //   continue;
    // }

    const packageHash = stringToHex(pkg, { size: 32 });
    // txs.push({
    //   ...registry,
    //   functionName: 'setPackageOwnership',
    //   value: registerFee as string,
    //   args: [packageHash, packageOwner],
    // });

    txs.push({
      ...registry,
      functionName: 'setAdditionalPublishers',
      value: registerFee as string,
      args: [packageHash, [], [packageOwner]],
    })
  }

  const value = txs.reduce((val, txn) => {
    return val + (BigInt(txn.value || 0) || BigInt(0));
  }, BigInt(0));


  const txData = {
    abi: JSON.parse(await fs.readFile(`./src/multicall.json`, 'utf8')),
    address: MULTICALL_ADDRESS,
    functionName: 'aggregate3Value',
    value,
    args: [
      txs.map((txn) => ({
        target: txn.address || zeroAddress,
        callData: encodeFunctionData(txn as any),
        value: txn.value || '0',
        requireSuccess: true,
      })),
    ],
  };

  const account = privateKeyToAccount(process.env.PRIVATE_KEY! as Address);

  const simulatedGas = await Mainnetclient.estimateContractGas({
    ...txData,
    account: packageOwner as Address
  } as any);

  console.log(simulatedGas)

  const params = {
    ...txData,
    account: packageOwner as Address,
  };


  console.log("SIMULATING CONTRACT")
  const tx = await Mainnetclient.simulateContract(params as any);

  console.log(tx);
  
  // (tx as any).gas = ((simulatedGas) * BigInt(2));
  (tx as any).gas = (simulatedGas * BigInt(12)) / BigInt(9);
  console.log((tx as any).gas)
    
  // const signer = await createWallet(Mainnetclient)
  // tx.request.account = account; 
  // console.log("Writing to contract")
  // const hash = await signer.writeContract(tx.request as any);
  // console.log("TX has been written")
  
  // const receipt = await Mainnetclient.waitForTransactionReceipt({ hash });
  // console.log("TX has been waited for")

  // console.log(receipt);
}

registerPackages('0xca7777aB932E8F0b930dE9F0d96f4E9a2a00DdD3');