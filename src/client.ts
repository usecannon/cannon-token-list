import { createPublicClient, http } from 'viem'

export const publicClient = createPublicClient({
    transport: http(process.env.PROVIDER_URL)
})