import { CannonStorage, IPFSLoader, OnChainRegistry, getCannonContract } from "@usecannon/builder";
import { Address, Abi, zeroAddress, stringToHex } from "viem";
import { createClient, createWallet } from "./client";
import fs from "fs/promises";
import { privateKeyToAccount } from 'viem/accounts';
import { debug } from "console";
import prompts from "prompts";
import { formatEther } from 'viem';
import { blue } from 'chalk';
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

  const packageOwner = account.address;

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

    const currentPackageOwner = await Mainnetclient.readContract({ ...registry, functionName: 'getPackageOwner', args: [packageHash] });

    if (currentPackageOwner != packageOwner) {
      console.log(`The "${pkg}" package has an existing owner at the following address: "${currentPackageOwner}", Skipping...`);
      return;
    }

    console.log("Creating registry transactions for:", pkg)

    if (currentPackageOwner == zeroAddress) {
      txs.push({
        ...registry,
        functionName: 'setPackageOwnership',
        value: registerFee as string,
        args: [packageHash, packageOwner],
      });
    }

    txs.push({
      ...registry,
      functionName: 'setAdditionalPublishers',
      value: registerFee as string,
      args: [packageHash, [], [packageOwner]],
    })
  }


  for (const txn of txs) {
    const params = {
      ...txn,
      account: account,
    };

    console.log('Current transaction function: ', txn.functionName)
    console.log('Current transaction args: ', txn.args)

    const simulatedGas = await Mainnetclient.estimateContractGas(params as any);

    console.log("Estimated total cost of this tx: ", simulatedGas)

    const tx = await Mainnetclient.simulateContract(params as any);

    const signer = await createWallet(Mainnetclient, process.env.MAINNET_URL as string);
    tx.request.account = account;

    console.log("Writing to contract..");
    const hash = await signer.writeContract(tx.request as any);

    console.log(hash)

    console.log(`tx with hash "${hash}" has been sent`)

    const receipt = await Mainnetclient.waitForTransactionReceipt({
      hash,
      timeout: 200_000,
      retryCount: 3,
      onReplaced: replacement => console.log("Transaction was replaced with: ", replacement)
    });
    console.log("TX has been waited for")

    debug(receipt);
    console.log("TRANSACTION STATUS:", receipt.status)
  }
}

registerPackages();