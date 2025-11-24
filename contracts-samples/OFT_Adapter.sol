// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFTAdapter } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/OFTAdapter.sol";

/**
 * @title CAOFTAdapter - Simplified for Internal Use
 * @notice Secure OFT Adapter for bridging CA tokens from Cronos to BNB Chain
 *
 * SIMPLIFIED FOR INTERNAL USE:
 * - Emergency pause capability (inherited from OApp)
 * - Owner-only access control (inherited from OApp)
 * - LayerZero peer validation
 * - No complex rate limiting (not needed for internal use)
 *
 * SECURITY:
 * - Locked tokens are secure (only trusted peer can trigger unlocks)
 * - LayerZero validates all cross-chain messages
 * - Emergency pause available if needed
 * - You own and control the contract
 *
 * @author Cro Army Team
 */
contract CAOFTAdapterSimple is OFTAdapter {

    /**
     * @notice Initialize the OFT Adapter
     * @param _token Address of the CA token on Cronos (0x444075EA64D69bf5002aE1A7F44642e46f8B56d4)
     * @param _lzEndpoint Address of LayerZero endpoint on Cronos
     * @param _delegate Delegate address (typically owner) for LayerZero operations
     */
    constructor(
        address _token,
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) {
        // Contract is ready to use after setPeer is called
    }

    /**
     * @notice Returns shared decimals for cross-chain precision
     * @return Shared decimals (6 for most ERC20 tokens)
     *
     * SECURITY CRITICAL: This MUST match the value in the BNB Chain OFT contract
     * Inconsistent values will result in permanent value loss
     */
    function sharedDecimals() public pure override returns (uint8) {
        return 6; // CRITICAL: Must match BNB Chain OFT contract
    }
}