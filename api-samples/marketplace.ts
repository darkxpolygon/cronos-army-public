import { NextRequest, NextResponse } from 'next/server';
import { formatEther } from 'viem';
import { executeRPCCall } from '@/app/lib/blockchain/multi-rpc';

const MARKETPLACE_ABI = [
  {
    name: 'buyListing',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: '_listingId', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'listings',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'listingId', type: 'uint256' },
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'seller', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
      { name: 'listedAt', type: 'uint256' }
    ]
  }
] as const;

export async function POST(request: NextRequest) {
  try {
    const { listingId, buyerAddress } = await request.json();

    if (!listingId || !buyerAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as `0x${string}`;

    if (!MARKETPLACE_ADDRESS) {
      return NextResponse.json(
        { error: 'Marketplace not configured' },
        { status: 500 }
      );
    }

    const isTestnet = process.env.NEXT_PUBLIC_USE_TESTNET === 'true';
    const chainId = isTestnet ? 338 : 25; // 338 = Cronos Testnet, 25 = Cronos Mainnet

    // Get listing details using multi-RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listing = await executeRPCCall(chainId, async (client) => {
      return await (client.readContract as any)({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'listings',
        args: [BigInt(listingId)]
      }) as any;
    });

    if (!listing.isActive) {
      return NextResponse.json(
        { error: 'Listing is no longer active' },
        { status: 400 }
      );
    }

    if (listing.seller.toLowerCase() === buyerAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Cannot buy your own listing' },
        { status: 400 }
      );
    }

    // Return transaction data for client-side execution
    const txData = {
      to: MARKETPLACE_ADDRESS,
      abi: MARKETPLACE_ABI,
      functionName: 'buyListing',
      args: [BigInt(listingId)],
      value: listing.price,
      description: `Buy NFT for ${formatEther(listing.price)} CRO`
    };

    return NextResponse.json({
      success: true,
      transactionData: txData,
      listing: {
        tokenId: listing.tokenId.toString(),
        seller: listing.seller,
        price: listing.price.toString(),
        priceFormatted: formatEther(listing.price)
      }
    });

  } catch (error: unknown) {
    console.error('Error preparing purchase:', error);
    return NextResponse.json(
      { error: 'Failed to prepare purchase' },
      { status: 500 }
    );
  }
}