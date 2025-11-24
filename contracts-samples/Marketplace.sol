// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CroArmyMarketplaceV2
 * @author CroArmy Team
 * @notice Enhanced NFT marketplace with per-collection royalties
 * @dev Implements comprehensive security measures including:
 *      - ReentrancyGuard for protection against reentrancy attacks
 *      - Pausable for emergency stops
 *      - Pull payment pattern for safe fund transfers
 *      - Per-collection royalty system
 *      - Checks-Effects-Interactions pattern
 */
contract CroArmyMarketplaceV2 is ReentrancyGuard, Pausable, Ownable {

    // ============ Constants ============
    uint256 public constant MAXIMUM_FEE_PERCENTAGE = 1000; // 10% max fee (basis points)
    uint256 public constant MAXIMUM_ROYALTY_PERCENTAGE = 1000; // 10% max royalty (basis points)
    uint256 public constant MINIMUM_PRICE = 1000000000000000; // 0.001 CRO minimum
    uint256 public constant MAXIMUM_PRICE = 1000000 ether; // 1M CRO maximum

    // ============ State Variables ============
    uint256 public marketplaceFee = 250; // 2.5% default fee (basis points)
    uint256 public totalVolume; // Track total trading volume
    uint256 public totalListings; // Track total number of listings
    uint256 public activeListingCount; // Track active listings
    uint256 public totalRoyaltiesDistributed; // Track total royalties paid

    // Listing ID counter
    uint256 private _listingIdCounter;

    // ============ Structs ============
    struct Listing {
        uint256 listingId;
        address nftContract;
        uint256 tokenId;
        address seller;
        uint256 price;
        bool isActive;
        uint256 listedAt;
    }

    struct CollectionRoyalty {
        address recipient;      // Who receives royalties
        uint256 percentage;     // Royalty percentage in basis points (e.g., 250 = 2.5%)
        bool isActive;         // Whether royalties are active
        uint256 totalCollected; // Total royalties collected for this collection
    }

    // ============ Mappings ============
    // listingId => Listing
    mapping(uint256 => Listing) public listings;

    // nftContract => tokenId => listingId (for quick lookups)
    mapping(address => mapping(uint256 => uint256)) public activeListings;

    // seller => listingIds[]
    mapping(address => uint256[]) public sellerListings;

    // Pending withdrawals for pull payment pattern
    mapping(address => uint256) public pendingWithdrawals;

    // Collection approval and royalty settings
    mapping(address => bool) public approvedCollections;
    mapping(address => CollectionRoyalty) public collectionRoyalties;

    // ============ Events ============
    event ListingCreated(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 price,
        uint256 timestamp
    );

    event ListingCancelled(
        uint256 indexed listingId,
        address indexed seller,
        uint256 timestamp
    );

    event ListingSold(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 price,
        uint256 marketplaceFee,
        uint256 royaltyAmount,
        uint256 timestamp
    );

    event ListingPriceUpdated(
        uint256 indexed listingId,
        uint256 oldPrice,
        uint256 newPrice,
        uint256 timestamp
    );

    event CollectionApprovalUpdated(
        address indexed nftContract,
        bool approved
    );

    event CollectionRoyaltyUpdated(
        address indexed nftContract,
        address indexed recipient,
        uint256 percentage,
        bool isActive
    );

    event RoyaltyPaid(
        address indexed nftContract,
        address indexed recipient,
        uint256 amount,
        uint256 listingId
    );

    event MarketplaceFeeUpdated(
        uint256 oldFee,
        uint256 newFee
    );

    event EmergencyWithdraw(
        address indexed recipient,
        uint256 amount
    );

    event Withdrawal(
        address indexed recipient,
        uint256 amount
    );

    // ============ Modifiers ============
    modifier onlyApprovedCollection(address _nftContract) {
        require(approvedCollections[_nftContract], "Collection not approved");
        _;
    }

    modifier validPrice(uint256 _price) {
        require(_price >= MINIMUM_PRICE, "Price below minimum");
        require(_price <= MAXIMUM_PRICE, "Price above maximum");
        _;
    }

    modifier listingExists(uint256 _listingId) {
        require(listings[_listingId].isActive, "Listing not active");
        _;
    }

    modifier onlySeller(uint256 _listingId) {
        require(listings[_listingId].seller == msg.sender, "Not the seller");
        _;
    }

    // ============ Constructor ============
    constructor(address _initialOwner) Ownable(_initialOwner) {
        require(_initialOwner != address(0), "Invalid owner address");
    }

    // ============ Main Functions ============

    /**
     * @notice Create a new listing for an NFT
     * @param _nftContract Address of the NFT contract
     * @param _tokenId Token ID to list
     * @param _price Price in wei
     */
    function createListing(
        address _nftContract,
        uint256 _tokenId,
        uint256 _price
    )
        external
        whenNotPaused
        nonReentrant
        onlyApprovedCollection(_nftContract)
        validPrice(_price)
    {
        IERC721 nft = IERC721(_nftContract);

        // Verify ownership
        require(nft.ownerOf(_tokenId) == msg.sender, "Not token owner");

        // Check marketplace has approval
        require(
            nft.getApproved(_tokenId) == address(this) ||
            nft.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        // Check if already listed
        require(
            activeListings[_nftContract][_tokenId] == 0,
            "Already listed"
        );

        // Create listing
        _listingIdCounter++;
        uint256 listingId = _listingIdCounter;

        listings[listingId] = Listing({
            listingId: listingId,
            nftContract: _nftContract,
            tokenId: _tokenId,
            seller: msg.sender,
            price: _price,
            isActive: true,
            listedAt: block.timestamp
        });

        activeListings[_nftContract][_tokenId] = listingId;
        sellerListings[msg.sender].push(listingId);

        totalListings++;
        activeListingCount++;

        emit ListingCreated(
            listingId,
            _nftContract,
            _tokenId,
            msg.sender,
            _price,
            block.timestamp
        );
    }

    /**
     * @notice Buy a listed NFT
     * @param _listingId ID of the listing to purchase
     */
    function buyListing(uint256 _listingId)
        external
        payable
        whenNotPaused
        nonReentrant
        listingExists(_listingId)
    {
        Listing storage listing = listings[_listingId];

        // Validate payment
        require(msg.value == listing.price, "Incorrect payment amount");

        // Cannot buy own listing
        require(msg.sender != listing.seller, "Cannot buy own listing");

        // Cache values before state changes
        address seller = listing.seller;
        uint256 price = listing.price;
        address nftContract = listing.nftContract;
        uint256 tokenId = listing.tokenId;

        // Calculate fees and royalties
        uint256 marketFeeAmount = (price * marketplaceFee) / 10000;
        uint256 royaltyAmount = 0;
        address royaltyRecipient = address(0);

        // Check if collection has royalties
        CollectionRoyalty memory royalty = collectionRoyalties[nftContract];
        if (royalty.isActive && royalty.recipient != address(0)) {
            royaltyAmount = (price * royalty.percentage) / 10000;
            royaltyRecipient = royalty.recipient;

            // Update royalty tracking
            collectionRoyalties[nftContract].totalCollected += royaltyAmount;
            totalRoyaltiesDistributed += royaltyAmount;
        }

        uint256 sellerProceeds = price - marketFeeAmount - royaltyAmount;

        // Update state before external calls
        listing.isActive = false;
        delete activeListings[nftContract][tokenId];
        activeListingCount--;
        totalVolume = totalVolume + price;

        // Add to pending withdrawals (pull payment pattern)
        pendingWithdrawals[seller] = pendingWithdrawals[seller] + sellerProceeds;
        pendingWithdrawals[owner()] = pendingWithdrawals[owner()] + marketFeeAmount;

        if (royaltyAmount > 0 && royaltyRecipient != address(0)) {
            pendingWithdrawals[royaltyRecipient] = pendingWithdrawals[royaltyRecipient] + royaltyAmount;
            emit RoyaltyPaid(nftContract, royaltyRecipient, royaltyAmount, _listingId);
        }

        // Transfer NFT to buyer (external call last)
        IERC721(nftContract).safeTransferFrom(seller, msg.sender, tokenId);

        emit ListingSold(
            _listingId,
            msg.sender,
            seller,
            price,
            marketFeeAmount,
            royaltyAmount,
            block.timestamp
        );
    }

    /**
     * @notice Cancel an active listing
     * @param _listingId ID of the listing to cancel
     */
    function cancelListing(uint256 _listingId)
        external
        nonReentrant
        listingExists(_listingId)
        onlySeller(_listingId)
    {
        Listing storage listing = listings[_listingId];

        // Update state
        listing.isActive = false;
        delete activeListings[listing.nftContract][listing.tokenId];
        activeListingCount--;

        emit ListingCancelled(_listingId, msg.sender, block.timestamp);
    }

    /**
     * @notice Update the price of an active listing
     * @param _listingId ID of the listing to update
     * @param _newPrice New price in wei
     */
    function updateListingPrice(uint256 _listingId, uint256 _newPrice)
        external
        nonReentrant
        listingExists(_listingId)
        onlySeller(_listingId)
        validPrice(_newPrice)
    {
        Listing storage listing = listings[_listingId];
        uint256 oldPrice = listing.price;

        // Update price
        listing.price = _newPrice;

        emit ListingPriceUpdated(
            _listingId,
            oldPrice,
            _newPrice,
            block.timestamp
        );
    }

    /**
     * @notice Withdraw pending payments (pull payment pattern)
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No funds to withdraw");

        // Update state before transfer
        pendingWithdrawals[msg.sender] = 0;

        // Transfer funds
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawal(msg.sender, amount);
    }

    // ============ Royalty Management Functions ============

    /**
     * @notice Set or update royalty settings for a collection
     * @param _nftContract Address of the NFT contract
     * @param _recipient Address to receive royalties
     * @param _percentage Royalty percentage in basis points (e.g., 250 = 2.5%)
     * @param _isActive Whether royalties should be active
     */
    function setCollectionRoyalty(
        address _nftContract,
        address _recipient,
        uint256 _percentage,
        bool _isActive
    ) external onlyOwner {
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_percentage <= MAXIMUM_ROYALTY_PERCENTAGE, "Royalty too high");

        // Allow recipient to be zero to disable royalties
        if (_isActive) {
            require(_recipient != address(0), "Invalid recipient for active royalty");
        }

        collectionRoyalties[_nftContract] = CollectionRoyalty({
            recipient: _recipient,
            percentage: _percentage,
            isActive: _isActive,
            totalCollected: collectionRoyalties[_nftContract].totalCollected
        });

        emit CollectionRoyaltyUpdated(_nftContract, _recipient, _percentage, _isActive);
    }

    /**
     * @notice Update only the royalty recipient for a collection
     * @param _nftContract Address of the NFT contract
     * @param _newRecipient New address to receive royalties
     */
    function updateRoyaltyRecipient(address _nftContract, address _newRecipient)
        external
        onlyOwner
    {
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_newRecipient != address(0), "Invalid recipient");
        require(collectionRoyalties[_nftContract].isActive, "Royalty not active");

        collectionRoyalties[_nftContract].recipient = _newRecipient;

        emit CollectionRoyaltyUpdated(
            _nftContract,
            _newRecipient,
            collectionRoyalties[_nftContract].percentage,
            true
        );
    }

    /**
     * @notice Update only the royalty percentage for a collection
     * @param _nftContract Address of the NFT contract
     * @param _newPercentage New royalty percentage in basis points
     */
    function updateRoyaltyPercentage(address _nftContract, uint256 _newPercentage)
        external
        onlyOwner
    {
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_newPercentage <= MAXIMUM_ROYALTY_PERCENTAGE, "Royalty too high");
        require(collectionRoyalties[_nftContract].isActive, "Royalty not active");

        collectionRoyalties[_nftContract].percentage = _newPercentage;

        emit CollectionRoyaltyUpdated(
            _nftContract,
            collectionRoyalties[_nftContract].recipient,
            _newPercentage,
            true
        );
    }

    /**
     * @notice Disable royalties for a collection
     * @param _nftContract Address of the NFT contract
     */
    function disableCollectionRoyalty(address _nftContract) external onlyOwner {
        require(_nftContract != address(0), "Invalid NFT contract");

        collectionRoyalties[_nftContract].isActive = false;

        emit CollectionRoyaltyUpdated(
            _nftContract,
            collectionRoyalties[_nftContract].recipient,
            collectionRoyalties[_nftContract].percentage,
            false
        );
    }

    // ============ Admin Functions ============

    /**
     * @notice Update marketplace fee (only owner)
     * @param _newFee New fee in basis points (e.g., 250 = 2.5%)
     */
    function updateMarketplaceFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= MAXIMUM_FEE_PERCENTAGE, "Fee too high");

        uint256 oldFee = marketplaceFee;
        marketplaceFee = _newFee;

        emit MarketplaceFeeUpdated(oldFee, _newFee);
    }

    /**
     * @notice Approve or revoke collection trading
     * @param _nftContract Address of the NFT contract
     * @param _approved Whether to approve or revoke
     */
    function setCollectionApproval(address _nftContract, bool _approved)
        external
        onlyOwner
    {
        require(_nftContract != address(0), "Invalid contract address");
        approvedCollections[_nftContract] = _approved;

        emit CollectionApprovalUpdated(_nftContract, _approved);
    }

    /**
     * @notice Pause marketplace (emergency only)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause marketplace
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdraw for owner (only when paused)
     * @param _recipient Address to receive funds
     */
    function emergencyWithdraw(address payable _recipient)
        external
        onlyOwner
        whenPaused
    {
        require(_recipient != address(0), "Invalid recipient");

        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = _recipient.call{value: balance}("");
        require(success, "Transfer failed");

        emit EmergencyWithdraw(_recipient, balance);
    }

    // ============ View Functions ============

    /**
     * @notice Get all listings by a seller
     * @param _seller Address of the seller
     * @return Array of listing IDs
     */
    function getSellerListings(address _seller)
        external
        view
        returns (uint256[] memory)
    {
        return sellerListings[_seller];
    }

    /**
     * @notice Get active listings count
     * @return Number of active listings
     */
    function getActiveListingsCount() external view returns (uint256) {
        return activeListingCount;
    }

    /**
     * @notice Get collection royalty info
     * @param _nftContract Address of the NFT contract
     * @return recipient Royalty recipient address
     * @return percentage Royalty percentage
     * @return isActive Whether royalties are active
     * @return totalCollected Total royalties collected
     */
    function getCollectionRoyalty(address _nftContract)
        external
        view
        returns (
            address recipient,
            uint256 percentage,
            bool isActive,
            uint256 totalCollected
        )
    {
        CollectionRoyalty memory royalty = collectionRoyalties[_nftContract];
        return (
            royalty.recipient,
            royalty.percentage,
            royalty.isActive,
            royalty.totalCollected
        );
    }

    /**
     * @notice Calculate fees for a given price
     * @param _nftContract NFT contract address
     * @param _price Sale price
     * @return marketFeeAmount Marketplace fee amount
     * @return royaltyAmount Royalty amount
     * @return sellerReceives Amount seller will receive
     */
    function calculateFees(address _nftContract, uint256 _price)
        external
        view
        returns (
            uint256 marketFeeAmount,
            uint256 royaltyAmount,
            uint256 sellerReceives
        )
    {
        marketFeeAmount = (_price * marketplaceFee) / 10000;

        CollectionRoyalty memory royalty = collectionRoyalties[_nftContract];
        if (royalty.isActive && royalty.recipient != address(0)) {
            royaltyAmount = (_price * royalty.percentage) / 10000;
        }

        sellerReceives = _price - marketFeeAmount - royaltyAmount;
    }

    /**
     * @notice Get marketplace statistics
     * @return volume Total trading volume
     * @return listings Total listings created
     * @return active Currently active listings
     * @return fee Current marketplace fee
     * @return royaltiesDistributed Total royalties distributed
     */
    function getMarketplaceStats()
        external
        view
        returns (
            uint256 volume,
            uint256 listings,
            uint256 active,
            uint256 fee,
            uint256 royaltiesDistributed
        )
    {
        return (
            totalVolume,
            totalListings,
            activeListingCount,
            marketplaceFee,
            totalRoyaltiesDistributed
        );
    }

    // ============ Receive Function ============
    receive() external payable {
        revert("Direct payments not accepted");
    }
}