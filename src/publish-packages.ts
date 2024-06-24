import { CannonStorage, IPFSLoader, OnChainRegistry, getCannonContract, preparePublishPackage } from "@usecannon/builder";
import { Address, Abi, zeroAddress, stringToHex, encodeFunctionData } from "viem";
import { createClient, createWallet } from "./client";
import fs from "fs/promises";
import { privateKeyToAccount } from 'viem/accounts';
import 'dotenv/config';
import {yellow} from 'chalk';

const MULTICALL_ADDRESS = '0xE2C5658cC5C448B48141168f3e475dF8f65A1e3e';
const REGISTRY_ADDRESS = '0x8E5C7EFC9636A6A0408A46BB7F617094B81e5dba';

export interface TxData {
  abi: Abi;
  address: Address;
  functionName: string;
  value?: string | bigint | number;
  args?: any[];
}

export async function publishPackages() {
  // Clear out published ipfs hash text file
  await fs.truncate('published-ipfs-hashes.txt', 0)
  // Read the contents of the deployed packages file
  const packages = await fs.readFile('./src/cannondir/packages', 'utf-8');
  // Split the data into an array of strings using newline characters as separators
  const packageNames: string[] = packages.split('\n').map(str => str.trim());

  const chainIds = [
    13370,
    1,
    10,
    56,
    42161,
    42220,
    534352,
    11155111,
    137,
    1101,
    43114
  ]

  console.log(packageNames)

  const OPClient = createClient(10, process.env.OP_URL!);
  const registry = await getCannonContract({
    package: 'registry:latest@main',
    chainId: 1,
    contractName: 'Proxy',
    storage: new CannonStorage(
      new OnChainRegistry({ address: REGISTRY_ADDRESS, provider: OPClient as any }),
      { ipfs: new IPFSLoader(process.env.IPFS_URL!, {}, 30000, 3) })
  });

  const fromStorage = new CannonStorage(
    new OnChainRegistry({ address: REGISTRY_ADDRESS, provider: OPClient as any }),
    { ipfs: new IPFSLoader(process.env.IPFS_URL!, {}, 30000, 3) });

  const toStorage = new CannonStorage(
    new OnChainRegistry({ address: REGISTRY_ADDRESS, provider: OPClient as any }),
    { ipfs: new IPFSLoader(process.env.PUBLISH_IPFS_URL!, {}, 30000, 3) });

  const publishFee = await OPClient.readContract({ ...registry, functionName: 'publishFee' });

  let txs: TxData[] = [];
  const multicallAbi = JSON.parse(await fs.readFile(`./src/multicall.json`, 'utf8'));

  for (let chainId of chainIds) {
    for (let pkg of packageNames) {
      const packageHash = stringToHex(pkg, { size: 32 });
      const variant = stringToHex(`${chainId}-main`, { size: 32 });

      let ipfsHash;
      let ipfsMetaHash;

      try {
        ipfsHash = (await fs.readFile(`./src/cannondir/tags/${pkg}_1.0.0_${chainId}-main.txt`)).toString();
        ipfsMetaHash = (await fs.readFile(`./src/cannondir/tags/${pkg}_1.0.0_${chainId}-main.meta.txt`)).toString();
      } catch (err) {
        console.log(`No deployment found for package "${pkg}" at chain id "${chainId}", skipping...`);
        continue;
      }

      // Pinning packages to the publish ipfs url 
      try {
        await preparePublishPackage({
          packageRef: '@ipfs:' + ipfsHash.replace('ipfs://', ''),
          chainId: 13370,
          tags: [],
          fromStorage,
          toStorage,
          includeProvisioned: false,
        });
      } catch (err) {
        console.log(yellow(`Failed to pin package hash ${ipfsHash.replace('ipfs://', '')}, you can pin it manually by running "cannon pin <ipfsHash>"`))
      }

      txs.push({
        ...registry,
        functionName: 'publish',
        value: publishFee as string,
        args: [
          packageHash,
          variant,
          ['1.0.0', 'latest'].map((t) => stringToHex(t, { size: 32 })),
          ipfsHash,
          ipfsMetaHash || '',
        ],
      });

      // Write published IPFS hashes to file so that we can auto-pin them after
      await fs.appendFile('published-ipfs-hashes.txt', `${ipfsHash}\n`)
    }
  }

  const value = txs.reduce((val, txn) => {
    return val + (BigInt(txn.value || 0) || BigInt(0));
  }, BigInt(0));


  const txArgs = txs.map((txn) => ({
    target: txn.address || zeroAddress,
    callData: encodeFunctionData(txn as any),
    value: txn.value || '0',
    requireSuccess: true,
  }));

  const txData = {
    abi: multicallAbi,
    address: MULTICALL_ADDRESS,
    functionName: 'aggregate3Value',
    value,
    args: [
      txArgs
    ],
  };

  const account = privateKeyToAccount(process.env.PRIVATE_KEY! as Address);

  const params = {
    ...txData,
    account: account,
  };

  const simulatedGas = await OPClient.estimateContractGas({
    ...txData,
    account: account
  } as any);


  console.log("Estimated total cost of tx: ", simulatedGas)

  console.log("Simulating...")
  const tx = await OPClient.simulateContract(params as any);

  const signer = await createWallet(OPClient, process.env.OP_URL as string)
  tx.request.account = account;
  console.log("Writing to contract")
  const hash = await signer.writeContract(tx.request as any);
  console.log("TX has been written")

  const receipt = await OPClient.waitForTransactionReceipt({ hash });
  console.log("TX has been waited for")

  console.log(receipt);

}

publishPackages();