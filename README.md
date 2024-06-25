# Cannon Token List
This is Cannon's official token generator, it allows for anyone to be able to deploy and publish token packages using the Uniswap Token List standard.

## Usage

Before starting to use the project, there are some important environment variables that need to be set in the `.env` file, use the `.env.example` file as a guideline.

1. The first step in the process is to generate the multichain token list for the tokens you want to deploy
```
npm run generate-multichain-list
```

2. Next, we attempt to build using cannon and generate the deployment data for the tokens you want to deploy
```
npm run generate-builds
```

3. Next, we attempt to build using cannon and generate the deployment data for the tokens you want to deploy
```
npm run generate-builds
```

This will create a file called `packages` inside the `src/cannondir/` folder, which will contain a list of all of the package-names that were built. If any build fails due to an invalid schema, it will be logged and it's deployment data will be stored in the `src/deploys` folder, which can be edited to match the schema and redeployed manually using cannon.

4. Next, step is to register the packages:
```
npm run register-packages
```

*Important note*: There is inconsistent behaviour with the package registering process in which some transactions may fail when broadcasting from the mainnet registry to the OP registry. If you run into any reverted transactions due to this, you may have to change your RPC endpoints or wait and try again.

4. Finally, publish the packages:
```
npm run publish-packages
```

