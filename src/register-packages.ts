import { CannonStorage, IPFSLoader, OnChainRegistry, getCannonContract } from "@usecannon/builder";
import { Address, Abi, zeroAddress, stringToHex } from "viem";
import { createClient, createWallet } from "./client";
import fs from "fs/promises";
import { privateKeyToAccount } from 'viem/accounts';
import { debug } from "console";
import prompts from "prompts";
import { formatEther } from 'viem';
import { blue, red, yellow } from 'chalk';
import 'dotenv/config';


const REGISTRY_PROXY_ADDRESS = '0x8E5C7EFC9636A6A0408A46BB7F617094B81e5dba';

export interface TxData {
  abi: Abi;
  address: Address;
  functionName: string;
  value?: string | bigint | number;
  args?: any[];
}

export async function registerPackages() {

  const account = privateKeyToAccount(process.env.PRIVATE_KEY! as Address);

  const packageOwner = '0xf1AF3f6C6386F57156BE2A7BbeddDe68F6Bd7e29';

  console.log(blue(`Registering packages with the following address "${packageOwner}"`))

  // Read the contents of the file
  const packages = await fs.readFile('./src/cannondir/packages', 'utf-8');
  // Split the data into an array of strings using newline characters as separators
  const packageNames: string[] = packages.split('\n').map(str => str.trim());

  const confirmation = await prompts({
    type: 'confirm',
    name: 'value',
    message: `This will register ${packageNames.length} packages, would you like to continue?`,
    initial: false,
  });

  if (!confirmation.value) {
    console.log("Package registration cancelled.")
    return;
  }

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

  let txs: TxData[] = [];
  const registerFee = await Mainnetclient.readContract({ ...registry, functionName: 'registerFee' });

  for (const pkg of packageNames) {
    const packageHash = stringToHex(pkg, { size: 32 });

    const currentPackageOwner: string = await Mainnetclient.readContract({ ...registry, functionName: 'getPackageOwner', args: [packageHash] }) as string;
    const additionalPublishers: string[] = await Mainnetclient.readContract({ ...registry, functionName: 'getAdditionalPublishers', args: [packageHash] }) as string[];

    console.log(additionalPublishers)

    console.log(`========== REGISTERING PACKAGE ${pkg} ==========`)

    if (currentPackageOwner == packageOwner) {
      console.log(yellow('Current package owner is already set to the signing address, skipping package ownership registration...'))
    } else {
      txs.push({
        ...registry,
        functionName: 'setPackageOwnership',
        value: registerFee as string,
        args: [packageHash, packageOwner],
      });
    }

    if (additionalPublishers.includes(packageOwner)) {
      console.log(yellow('Signing address is already set as an additional publisher, skipping additional publisher registration...'))
    } else {
      txs.push({
        ...registry,
        functionName: 'setAdditionalPublishers',
        value: registerFee as string,
        args: [packageHash, [], [packageOwner]],
      })
    }
  }

  const signer = await createWallet(Mainnetclient, process.env.MAINNET_URL as string, account.address);

  let transactionCount = await Mainnetclient.getTransactionCount({
    address: signer.account!.address,
  });


  for (const txn of txs) {
    try {
      console.log("TX COUNT", transactionCount)

      const params = {
        ...txn,
        account: account,
      };

      console.log('Current transaction function: ', txn.functionName)

      const simulatedGas = await Mainnetclient.estimateContractGas(params as any);

      console.log("Estimated total cost of this tx: ", simulatedGas)

      const tx = await Mainnetclient.simulateContract(params as any);
      tx.request.account = account;
      tx.request.nonce = transactionCount;

      console.log("Writing to contract..");
      const hash = await signer.writeContract(tx.request as any);

      console.log(`tx with hash "${hash}" has been sent`)

      const receipt = await Mainnetclient.waitForTransactionReceipt({
        hash,
        timeout: 500_000,
        retryCount: 3,
        onReplaced: replacement => console.log("Transaction was replaced with: ", replacement)
      });
      console.log("TX has been waited for")

      debug(receipt);
      console.log("TRANSACTION STATUS:", receipt.status)
    } catch (err) {
      console.log(red(`Transaction failed with error:`, err))
    }
    transactionCount = transactionCount + 1;
  }
}

registerPackages();