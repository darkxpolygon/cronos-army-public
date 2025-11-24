// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BaseTerritory
 * @dev NFT contract for Base Territory system with on-demand metadata publishing
 * @notice Base territories are permanent bases that players develop with facilities and soldiers
 *
 * Key Features:
 * - On-demand metadata publishing (updates only when owner requests)
 * - Unlimited tier progression via merging (no cap - Tier 1, 2, 3, 4, 5...)
 * - CA token payment for Tier 1 minting
 * - Merge functionality (burn 2 bases → create 1 higher tier)
 * - EIP-4906 MetadataUpdate events for marketplace compatibility
 * - Security: ReentrancyGuard, checks-effects-interactions pattern
 */
contract BaseTerritory is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable, ReentrancyGuard {
    // =============================================
    // STATE VARIABLES
    // =============================================

    // Token ID counter
    uint256 private _tokenIdCounter;

    // Minting configuration
    uint256 public constant MAX_SUPPLY = 100000;
    uint256 public mintPrice = 100000 ether; // 100,000 CA tokens (~$20 USD at $0.0002)
    bool public mintingActive = true;

    // CA token contract for minting payments
    IERC20 public caToken;

    // Treasury address for payment collection
    address public treasury;

    // Last metadata update timestamp per token
    mapping(uint256 => uint256) public lastMetadataUpdate;

    // Tier tracking (unlimited progression via merging)
    mapping(uint256 => uint256) public tokenTier;

    // =============================================
    // EVENTS
    // =============================================

    event BaseTerritoryMinted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 tier,
        uint256 timestamp
    );

    event BaseTerritoryMerged(
        uint256 indexed sourceToken1,
        uint256 indexed sourceToken2,
        uint256 indexed newToken,
        uint256 newTier,
        address owner,
        uint256 timestamp
    );

    event MetadataPublished(
        uint256 indexed tokenId,
        address indexed owner,
        string newMetadataURI,
        uint256 timestamp
    );

    event MintingStatusChanged(bool active);
    event MintPriceChanged(uint256 newPrice);
    event CATokenAddressUpdated(address indexed newAddress);
    event TreasuryUpdated(address indexed newTreasury);

    // Note: MetadataUpdate and BatchMetadataUpdate events are inherited from IERC4906
    // via ERC721URIStorage, so we don't redeclare them here

    // =============================================
    // CONSTRUCTOR
    // =============================================

    constructor(
        address _caTokenAddress,
        address _treasury
    ) ERC721("Cronos Army Base Territory", "CABASE") Ownable(msg.sender) {
        require(_caTokenAddress != address(0), "Invalid CA token address");
        require(_treasury != address(0), "Invalid treasury address");

        caToken = IERC20(_caTokenAddress);
        treasury = _treasury;

        // Start token IDs at 1
        _tokenIdCounter = 0;
    }

    // =============================================
    // MINTING FUNCTIONS
    // =============================================

    /**
     * @dev Mint a new Tier 1 base territory NFT with CA token payment
     * @param initialMetadataURI Initial metadata URI (can be updated later)
     * @notice Requires approval for mintPrice CA tokens before calling
     * @return tokenId The newly minted token ID
     */
    function mintBaseTerritory(string memory initialMetadataURI)
        public
        nonReentrant
        returns (uint256)
    {
        require(mintingActive, "Minting is paused");
        require(_tokenIdCounter < MAX_SUPPLY, "Max supply reached");
        require(bytes(initialMetadataURI).length > 0, "Metadata URI required");
        require(address(caToken) != address(0), "CA token not configured");
        require(treasury != address(0), "Treasury not configured");

        // CHECKS-EFFECTS-INTERACTIONS PATTERN

        // Effects: Increment token ID
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        // Interactions: Transfer CA tokens from user to treasury
        // User must have approved this contract to spend mintPrice CA tokens
        bool paymentSuccess = caToken.transferFrom(msg.sender, treasury, mintPrice);
        require(paymentSuccess, "CA token payment failed");

        // Effects: Mint NFT
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, initialMetadataURI);

        // Effects: Set initial tier (all minted bases start at Tier 1)
        tokenTier[tokenId] = 1;

        // Effects: Record metadata update timestamp
        lastMetadataUpdate[tokenId] = block.timestamp;

        emit BaseTerritoryMinted(tokenId, msg.sender, 1, block.timestamp);
        emit MetadataUpdate(tokenId);

        return tokenId;
    }

    /**
     * @dev Batch mint multiple base territories (admin only)
     * @param to Recipient address
     * @param count Number of bases to mint
     * @param initialMetadataURI Initial metadata URI for all tokens
     */
    function batchMintBaseTerritory(
        address to,
        uint256 count,
        string memory initialMetadataURI
    ) public onlyOwner {
        require(mintingActive, "Minting is paused");
        require(_tokenIdCounter + count <= MAX_SUPPLY, "Would exceed max supply");
        require(bytes(initialMetadataURI).length > 0, "Metadata URI required");

        uint256 firstTokenId = _tokenIdCounter + 1;

        for (uint256 i = 0; i < count; i++) {
            _tokenIdCounter++;
            uint256 tokenId = _tokenIdCounter;

            _safeMint(to, tokenId);
            _setTokenURI(tokenId, initialMetadataURI);
            tokenTier[tokenId] = 1;
            lastMetadataUpdate[tokenId] = block.timestamp;

            emit BaseTerritoryMinted(tokenId, to, 1, block.timestamp);
        }

        emit BatchMetadataUpdate(firstTokenId, _tokenIdCounter);
    }

    // =============================================
    // ON-DEMAND METADATA PUBLISHING
    // =============================================

    /**
     * @dev Publish updated metadata to blockchain (on-demand)
     * @param tokenId Token ID to update
     * @param newMetadataURI New metadata URI from IPFS
     * @notice Only callable by token owner. Updates metadata on-chain for marketplaces.
     * Gas-optimized: only update when selling or showcasing.
     */
    function publishMetadata(uint256 tokenId, string memory newMetadataURI) public {
        require(_ownerOf(tokenId) == msg.sender, "Not token owner");
        require(bytes(newMetadataURI).length > 0, "Metadata URI required");

        // Update token URI
        _setTokenURI(tokenId, newMetadataURI);

        // Record update timestamp
        lastMetadataUpdate[tokenId] = block.timestamp;

        emit MetadataPublished(tokenId, msg.sender, newMetadataURI, block.timestamp);
        emit MetadataUpdate(tokenId);
    }

    /**
     * @dev Batch publish metadata for multiple tokens (owner only)
     * @param tokenIds Array of token IDs
     * @param metadataURIs Array of metadata URIs (must match tokenIds length)
     */
    function batchPublishMetadata(
        uint256[] memory tokenIds,
        string[] memory metadataURIs
    ) public {
        require(tokenIds.length == metadataURIs.length, "Array length mismatch");
        require(tokenIds.length > 0, "Empty arrays");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(_ownerOf(tokenIds[i]) == msg.sender, "Not token owner");
            require(bytes(metadataURIs[i]).length > 0, "Metadata URI required");

            _setTokenURI(tokenIds[i], metadataURIs[i]);
            lastMetadataUpdate[tokenIds[i]] = block.timestamp;

            emit MetadataPublished(tokenIds[i], msg.sender, metadataURIs[i], block.timestamp);
            emit MetadataUpdate(tokenIds[i]);
        }
    }

    // =============================================
    // TIER MANAGEMENT & MERGE FUNCTIONALITY
    // =============================================

    /**
     * @dev Get token tier
     * @param tokenId Token ID to query
     * @return Tier level (1, 2, 3, 4, 5... unlimited)
     */
    function getTokenTier(uint256 tokenId) public view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return tokenTier[tokenId];
    }

    /**
     * @dev Merge two base territories to create one higher-tier base
     * @param sourceTokenId1 First base to merge (will be burned)
     * @param sourceTokenId2 Second base to merge (will be burned)
     * @param newMetadataURI Metadata URI for the new higher-tier base
     * @notice Both bases must be same tier and owned by caller. Burns both, mints new higher tier.
     * @notice No tier cap - can merge infinitely (Tier 1→2→3→4→5...)
     * @return newTokenId The newly created higher-tier token ID
     */
    function mergeBaseTerritories(
        uint256 sourceTokenId1,
        uint256 sourceTokenId2,
        string memory newMetadataURI
    )
        public
        nonReentrant
        returns (uint256)
    {
        // CHECKS: Validation
        require(sourceTokenId1 != sourceTokenId2, "Cannot merge same token");
        require(bytes(newMetadataURI).length > 0, "Metadata URI required");
        require(_ownerOf(sourceTokenId1) == msg.sender, "Not owner of token 1");
        require(_ownerOf(sourceTokenId2) == msg.sender, "Not owner of token 2");

        uint256 sourceTier = tokenTier[sourceTokenId1];
        require(tokenTier[sourceTokenId2] == sourceTier, "Tokens must be same tier");
        require(_tokenIdCounter < MAX_SUPPLY, "Max supply reached");

        // EFFECTS: Increment token ID for new base
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        uint256 newTier = sourceTier + 1;

        // EFFECTS: Burn source tokens (this also handles ownership checks)
        _burn(sourceTokenId1);
        _burn(sourceTokenId2);

        // EFFECTS: Mint new higher-tier base
        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, newMetadataURI);

        // EFFECTS: Set new tier (no cap - unlimited progression)
        tokenTier[newTokenId] = newTier;

        // EFFECTS: Record metadata update timestamp
        lastMetadataUpdate[newTokenId] = block.timestamp;

        emit BaseTerritoryMerged(
            sourceTokenId1,
            sourceTokenId2,
            newTokenId,
            newTier,
            msg.sender,
            block.timestamp
        );
        emit MetadataUpdate(newTokenId);

        return newTokenId;
    }

    /**
     * @dev Admin function to manually upgrade token tier (emergency only)
     * @param tokenId Token ID to upgrade
     * @param newTier New tier level
     * @notice Only for emergencies. Normal progression via mergeBaseTerritories()
     */
    function adminUpgradeTier(uint256 tokenId, uint256 newTier) public onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(newTier > tokenTier[tokenId], "Can only upgrade tier");

        tokenTier[tokenId] = newTier;
        emit MetadataUpdate(tokenId);
    }

    // =============================================
    // VIEW FUNCTIONS
    // =============================================

    /**
     * @dev Get all token IDs owned by an address
     * @param owner Address to query
     * @return Array of token IDs
     */
    function tokensOfOwner(address owner) public view returns (uint256[] memory) {
        uint256 tokenCount = balanceOf(owner);
        uint256[] memory tokenIds = new uint256[](tokenCount);

        for (uint256 i = 0; i < tokenCount; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(owner, i);
        }

        return tokenIds;
    }

    /**
     * @dev Get total minted count
     * @return Number of tokens minted
     */
    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev Check if token exists
     * @param tokenId Token ID to check
     * @return True if token exists
     */
    function exists(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    // =============================================
    // ADMIN FUNCTIONS
    // =============================================

    /**
     * @dev Set minting active status
     * @param active New minting status
     */
    function setMintingActive(bool active) public onlyOwner {
        mintingActive = active;
        emit MintingStatusChanged(active);
    }

    /**
     * @dev Set mint price
     * @param newPrice New mint price in CA tokens
     */
    function setMintPrice(uint256 newPrice) public onlyOwner {
        require(newPrice > 0, "Price must be greater than 0");
        mintPrice = newPrice;
        emit MintPriceChanged(newPrice);
    }

    /**
     * @dev Set CA token address for payments
     * @param newAddress New CA token contract address
     */
    function setCATokenAddress(address newAddress) public onlyOwner {
        require(newAddress != address(0), "Invalid address");
        caToken = IERC20(newAddress);
        emit CATokenAddressUpdated(newAddress);
    }

    /**
     * @dev Set treasury address for payment collection
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) public onlyOwner {
        require(newTreasury != address(0), "Invalid address");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @dev Withdraw contract balance (for any accidental CRO sent)
     */
    function withdraw() public onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    /**
     * @dev Emergency function to recover any ERC20 tokens accidentally sent to contract
     * @param token Token contract address
     * @param amount Amount to recover
     */
    function recoverERC20(address token, uint256 amount) public onlyOwner {
        require(token != address(0), "Invalid token address");
        IERC20(token).transfer(owner(), amount);
    }

    // =============================================
    // REQUIRED OVERRIDES
    // =============================================

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}