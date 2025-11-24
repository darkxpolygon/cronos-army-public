// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CroArmySoldiers
 * @dev NFT contract for Cro Army Soldiers with trait-based metadata
 * BNB Mainnet deployment - No CA token verification
 */
contract CroArmySoldiers is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {
    // Token ID counter
    uint256 private _tokenIdCounter;

    // Minting configuration
    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public mintPrice = 0.005 ether; // 0.005 BNB
    bool public mintingActive = true;

    // Rank-based supply tracking
    mapping(string => uint256) public rankSupply;
    mapping(string => uint256) public rankMaxSupply;

    // Rank-based CA token requirements (in wei, 18 decimals)
    mapping(string => uint256) public rankCARequirement;

    // Soldier metadata
    struct SoldierTraits {
        string name;
        string unit;
        string personality;
        string rank;
        string[] features;
        uint256 mintedAt;
    }

    mapping(uint256 => SoldierTraits) public soldierTraits;
    mapping(address => uint256[]) public ownerTokens;

    // Events
    event SoldierMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string name,
        string rank
    );
    event MintingStatusChanged(bool active);
    event MintPriceChanged(uint256 newPrice);
    event RankSupplySet(string rank, uint256 maxSupply);
    event TokenURIUpdated(uint256 indexed tokenId, string newURI);
    event BatchTokenURIUpdated(uint256[] tokenIds);

    // \$CA token address for rank verification (optional)
    address public caTokenAddress;

    constructor() ERC721("Cro Army Soldiers", "SOLDIER") {
        // Initialize rank max supplies and CA requirements
        _initializeRankSupplies();
        _initializeRankRequirements();
        caTokenAddress = 0x66Daa21E4A2199f80dBBb6C7e6a4eBB4CA0E46Ce;
    }

    /**
     * @dev Initialize rank-based max supplies
     */
    function _initializeRankSupplies() private {
        rankMaxSupply["private"] = 10000;
        rankMaxSupply["corporal"] = 5000;
        rankMaxSupply["sergeant"] = 2500;
        rankMaxSupply["captain"] = 1000;
        rankMaxSupply["major"] = 500;
        rankMaxSupply["colonel"] = 250;
        rankMaxSupply["general"] = 100;
        rankMaxSupply["legendary"] = 0;
    }

    /**
     * @dev Initialize rank-based CA token requirements
     */
    function _initializeRankRequirements() private {
        rankCARequirement["private"] = 50000 * 10**18;
        rankCARequirement["corporal"] = 200000 * 10**18;
        rankCARequirement["sergeant"] = 500000 * 10**18;
        rankCARequirement["captain"] = 1000000 * 10**18;
        rankCARequirement["major"] = 3000000 * 10**18;
        rankCARequirement["colonel"] = 5000000 * 10**18;
        rankCARequirement["general"] = 7000000 * 10**18;
        rankCARequirement["legendary"] = 10000000 * 10**18;
    }

    /**
     * @dev Mint a new soldier NFT
     */
    function mintSoldier(
        string memory _name,
        string memory _unit,
        string memory _personality,
        string memory _rank,
        string[] memory _features,
        string memory _tokenURI
    ) public payable {
        require(mintingActive, "Minting is paused");
        require(msg.value >= mintPrice, "Insufficient payment");
        require(_tokenIdCounter < MAX_SUPPLY, "Max supply reached");
        require(bytes(_name).length > 0, "Name required");
        require(rankSupply[_rank] < rankMaxSupply[_rank], "Rank supply exhausted");

        // Verify CA token holdings for rank eligibility
        if (caTokenAddress != address(0)) {
            uint256 requiredCA = rankCARequirement[_rank];
            require(requiredCA > 0, "Invalid rank");

            uint256 userBalance = IERC20(caTokenAddress).balanceOf(msg.sender);
            require(userBalance >= requiredCA, "Insufficient CA tokens for this rank");
        }

        // Increment token ID
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        // Mint NFT
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);

        // Store traits on-chain
        soldierTraits[tokenId] = SoldierTraits({
            name: _name,
            unit: _unit,
            personality: _personality,
            rank: _rank,
            features: _features,
            mintedAt: block.timestamp
        });

        // Update rank supply
        rankSupply[_rank]++;

        // Track owner's tokens
        ownerTokens[msg.sender].push(tokenId);

        emit SoldierMinted(tokenId, msg.sender, _name, _rank);
    }

    /**
     * @dev Batch mint for initial distribution (owner only)
     */
    function batchMint(
        address[] memory recipients,
        string[] memory names,
        string[] memory units,
        string[] memory personalities,
        string[] memory ranks,
        string[][] memory features,
        string[] memory tokenURIs
    ) external onlyOwner {
        require(
            recipients.length == names.length &&
            recipients.length == units.length &&
            recipients.length == personalities.length &&
            recipients.length == ranks.length &&
            recipients.length == features.length &&
            recipients.length == tokenURIs.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            require(_tokenIdCounter < MAX_SUPPLY, "Max supply reached");

            _tokenIdCounter++;
            uint256 tokenId = _tokenIdCounter;

            _safeMint(recipients[i], tokenId);
            _setTokenURI(tokenId, tokenURIs[i]);

            soldierTraits[tokenId] = SoldierTraits({
                name: names[i],
                unit: units[i],
                personality: personalities[i],
                rank: ranks[i],
                features: features[i],
                mintedAt: block.timestamp
            });

            rankSupply[ranks[i]]++;
            ownerTokens[recipients[i]].push(tokenId);

            emit SoldierMinted(tokenId, recipients[i], names[i], ranks[i]);
        }
    }

    /**
     * @dev Get soldier traits
     */
    function getSoldierTraits(uint256 tokenId) external view returns (SoldierTraits memory) {
        require(_exists(tokenId), "Token does not exist");
        return soldierTraits[tokenId];
    }

    /**
     * @dev Get all tokens owned by an address
     */
    function getOwnerTokens(address owner) external view returns (uint256[] memory) {
        return ownerTokens[owner];
    }

    /**
     * @dev Update soldier name (token owner only)
     */
    function updateSoldierName(uint256 tokenId, string memory newName) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(bytes(newName).length > 0, "Name required");
        soldierTraits[tokenId].name = newName;
    }

    /**
     * @dev Update token URI for a specific token (contract owner only)
     * @param tokenId The token ID to update
     * @param newTokenURI The new metadata URI (IPFS/Pinata URL)
     *
     * SECURITY: Only contract owner can call this (onlyOwner modifier)
     * NFT holders cannot change metadata URIs (only their soldier name via updateSoldierName)
     */
    function updateTokenURI(uint256 tokenId, string memory newTokenURI) external onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        _setTokenURI(tokenId, newTokenURI);
        emit TokenURIUpdated(tokenId, newTokenURI);
    }

    /**
     * @dev Batch update token URIs (contract owner only)
     * @param tokenIds Array of token IDs to update
     * @param newTokenURIs Array of new metadata URIs
     *
     * SECURITY: Only contract owner can call this
     * Useful for updating multiple soldier images at once
     */
    function batchUpdateTokenURIs(
        uint256[] memory tokenIds,
        string[] memory newTokenURIs
    ) external onlyOwner {
        require(tokenIds.length == newTokenURIs.length, "Array length mismatch");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(_ownerOf(tokenIds[i]) != address(0), "Token does not exist");
            _setTokenURI(tokenIds[i], newTokenURIs[i]);
        }

        emit BatchTokenURIUpdated(tokenIds);
    }

    /**
     * @dev Toggle minting status
     */
    function setMintingActive(bool _active) external onlyOwner {
        mintingActive = _active;
        emit MintingStatusChanged(_active);
    }

    /**
     * @dev Update mint price
     */
    function setMintPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
        emit MintPriceChanged(_price);
    }

    /**
     * @dev Set $CA token address for rank verification
     */
    function setCATokenAddress(address _caToken) external onlyOwner {
        caTokenAddress = _caToken;
    }

    /**
     * @dev Update rank max supply
     */
    function setRankMaxSupply(string memory _rank, uint256 _maxSupply) external onlyOwner {
        rankMaxSupply[_rank] = _maxSupply;
        emit RankSupplySet(_rank, _maxSupply);
    }

    /**
     * @dev Withdraw contract balance
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    /**
     * @dev Get total minted count
     */
    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev Get remaining supply for a rank
     */
    function getRankRemainingSupply(string memory _rank) external view returns (uint256) {
        return rankMaxSupply[_rank] - rankSupply[_rank];
    }

    // Required overrides for OpenZeppelin v4.9.6 compatibility
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
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