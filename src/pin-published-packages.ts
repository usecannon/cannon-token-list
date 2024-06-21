import { preparePublishPackage } from "@usecannon/builder/dist/src/package";
import { CannonStorage, } from "@usecannon/builder";

/**
 * 
 * @param ipfsHashes ipfs hashes of the published packages
 */
export async function pinPublishedPackages(ipfsHashes: string[]) {
  // const localRegistry = new LocalRegistry(process.env.CANNON_DIRECTORY);
  // const fromStorage = new CannonStorage(await createDefaultReadRegistry(cliSettings), getMainLoader(cliSettings));

  // const toStorage = new CannonStorage(new InMemoryRegistry(), {
  //   ipfs: new IPFSLoader(cliSettings.publishIpfsUrl || getCannonRepoRegistryUrl()),
  // });

  // ipfsHashes.forEach(async (hash) => {
  //   await preparePublishPackage({
  //     packageRef: hash,
  //      chainId: 13370,
  //      tags: [],

  //    });
  // })
}
