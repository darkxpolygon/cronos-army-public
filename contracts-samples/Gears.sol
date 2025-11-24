// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title GearNFT V2
 * @notice Gear NFT system for Cro Army soldiers - V2 with off-chain power calculation
 *
 * Features:
 * - Mint off-chain gear to on-chain NFTs with pre-calculated total power
 * - Transfer gear between ANY soldiers (including other players')
 * - Burn CA tokens on mint (deflationary)
 * - Adjustable mint cost
 * - Unlimited supply
 * - All metadata on-chain
 * - Power calculated off-chain for full control
 */
contract GearNFTV2 is ERC721, Ownable {
    using Strings for uint256;

    // ============ State Variables ============

    IERC20 public immutable caToken;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint256 public mintCost = 5000 * 10**18; // 5000 CA tokens
    uint256 private _nextTokenId = 1;

    // Gear rarity types
    uint8 public constant RARITY_COMMON = 1;
    uint8 public constant RARITY_RARE = 2;
    uint8 public constant RARITY_EPIC = 3;
    uint8 public constant RARITY_LEGENDARY = 4;

    struct Gear {
        uint256 gearId;
        string gearType;      // "weapon", "armor", "boost"
        string name;          // "Plasma Rifle", "Dragon Armor"
        uint256 totalPower;   // Total power (calculated off-chain)
        uint8 rarity;         // 1-4 (common, rare, epic, legendary)
        uint256 equippedTo;   // Soldier NFT token ID (0 = unequipped)
        uint256 mintedAt;     // Block timestamp
        string imageUrl;      // IPFS or Pinata URL for gear image
    }

    // Mappings
    mapping(uint256 => Gear) public gears;                    // tokenId => Gear
    mapping(uint256 => uint256[]) public soldierToGears;      // soldierTokenId => gearTokenIds[]
    mapping(uint256 => mapping(uint256 => bool)) private _soldierHasGear; // soldierTokenId => gearTokenId => bool

    // ============ Events ============

    event GearMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string gearType,
        uint256 totalPower,
        uint8 rarity
    );

    event GearEquipped(
        uint256 indexed gearTokenId,
        uint256 indexed soldierTokenId,
        address indexed owner
    );

    event GearUnequipped(
        uint256 indexed gearTokenId,
        uint256 indexed soldierTokenId
    );

    event MintCostUpdated(uint256 oldCost, uint256 newCost);

    event CATokensBurned(address indexed from, uint256 amount);

    // ============ Constructor ============

    constructor(address _caToken) ERC721("Cro Army Gear V2", "CAGEAR2") Ownable(msg.sender) {
        require(_caToken != address(0), "Invalid CA token address");
        caToken = IERC20(_caToken);
    }

    // ============ Minting Functions ============

    /**
     * @notice Mint a new gear NFT with pre-calculated power
     * @param gearType Type of gear (weapon, armor, boost)
     * @param name Name of the gear
     * @param totalPower Total power (calculated off-chain)
     * @param rarity Rarity level (1-4)
     * @param imageUrl IPFS/Pinata URL for gear image
     * @return tokenId The newly minted token ID
     */
    function mintGear(
        string memory gearType,
        string memory name,
        uint256 totalPower,
        uint8 rarity,
        string memory imageUrl
    ) external returns (uint256) {
        require(bytes(gearType).length > 0, "Gear type required");
        require(bytes(name).length > 0, "Name required");
        require(totalPower > 0, "Total power must be > 0");
        require(rarity >= RARITY_COMMON && rarity <= RARITY_LEGENDARY, "Invalid rarity");

        // Burn CA tokens (send to dead address)
        require(
            caToken.transferFrom(msg.sender, DEAD_ADDRESS, mintCost),
            "CA transfer failed"
        );

        emit CATokensBurned(msg.sender, mintCost);

        // Mint NFT
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        // Store gear data
        gears[tokenId] = Gear({
            gearId: tokenId,
            gearType: gearType,
            name: name,
            totalPower: totalPower,
            rarity: rarity,
            equippedTo: 0, // Not equipped initially
            mintedAt: block.timestamp,
            imageUrl: imageUrl
        });

        emit GearMinted(tokenId, msg.sender, gearType, totalPower, rarity);

        return tokenId;
    }

    // ============ Gear Management Functions ============

    /**
     * @notice Equip gear to a soldier
     * @param gearTokenId The gear NFT token ID
     * @param soldierTokenId The soldier NFT token ID
     */
    function equipGear(uint256 gearTokenId, uint256 soldierTokenId) external {
        require(ownerOf(gearTokenId) == msg.sender, "Not gear owner");
        require(soldierTokenId > 0, "Invalid soldier ID");

        Gear storage gear = gears[gearTokenId];

        // Unequip from previous soldier if equipped
        if (gear.equippedTo != 0) {
            _removeGearFromSoldier(gear.equippedTo, gearTokenId);
        }

        // Equip to new soldier
        gear.equippedTo = soldierTokenId;
        soldierToGears[soldierTokenId].push(gearTokenId);
        _soldierHasGear[soldierTokenId][gearTokenId] = true;

        emit GearEquipped(gearTokenId, soldierTokenId, msg.sender);
    }

    /**
     * @notice Unequip gear from soldier
     * @param gearTokenId The gear NFT token ID
     */
    function unequipGear(uint256 gearTokenId) external {
        require(ownerOf(gearTokenId) == msg.sender, "Not gear owner");

        Gear storage gear = gears[gearTokenId];
        require(gear.equippedTo != 0, "Gear not equipped");

        uint256 soldierTokenId = gear.equippedTo;
        _removeGearFromSoldier(soldierTokenId, gearTokenId);
        gear.equippedTo = 0;

        emit GearUnequipped(gearTokenId, soldierTokenId);
    }

    /**
     * @notice Move gear to another soldier (can be any player's soldier)
     * @param gearTokenId The gear NFT token ID
     * @param toSoldierTokenId The target soldier NFT token ID
     */
    function moveGear(uint256 gearTokenId, uint256 toSoldierTokenId) external {
        require(ownerOf(gearTokenId) == msg.sender, "Not gear owner");
        require(toSoldierTokenId > 0, "Invalid target soldier");

        Gear storage gear = gears[gearTokenId];

        // Unequip from current soldier
        if (gear.equippedTo != 0) {
            _removeGearFromSoldier(gear.equippedTo, gearTokenId);
        }

        // Equip to target soldier
        gear.equippedTo = toSoldierTokenId;
        soldierToGears[toSoldierTokenId].push(gearTokenId);
        _soldierHasGear[toSoldierTokenId][gearTokenId] = true;

        emit GearEquipped(gearTokenId, toSoldierTokenId, msg.sender);
    }

    /**
     * @dev Remove gear from soldier's equipment array
     */
    function _removeGearFromSoldier(uint256 soldierTokenId, uint256 gearTokenId) private {
        uint256[] storage equippedGears = soldierToGears[soldierTokenId];

        for (uint256 i = 0; i < equippedGears.length; i++) {
            if (equippedGears[i] == gearTokenId) {
                equippedGears[i] = equippedGears[equippedGears.length - 1];
                equippedGears.pop();
                break;
            }
        }

        _soldierHasGear[soldierTokenId][gearTokenId] = false;
    }

    // ============ View Functions ============

    /**
     * @notice Get all gear equipped to a soldier
     */
    function getSoldierGears(uint256 soldierTokenId) external view returns (uint256[] memory) {
        return soldierToGears[soldierTokenId];
    }

    /**
     * @notice Get count of gear equipped to a soldier
     */
    function getSoldierGearCount(uint256 soldierTokenId) external view returns (uint256) {
        return soldierToGears[soldierTokenId].length;
    }

    /**
     * @notice Get full gear details
     */
    function getGear(uint256 tokenId) external view returns (Gear memory) {
        require(_ownerOf(tokenId) != address(0), "Gear does not exist");
        return gears[tokenId];
    }

    /**
     * @notice Get total power of gear
     */
    function getGearTotalPower(uint256 tokenId) external view returns (uint256) {
        return gears[tokenId].totalPower;
    }

    /**
     * @notice Check if gear is equipped to a soldier
     */
    function isGearEquipped(uint256 gearTokenId, uint256 soldierTokenId) external view returns (bool) {
        return _soldierHasGear[soldierTokenId][gearTokenId];
    }

    // ============ Admin Functions ============

    /**
     * @notice Update mint cost (owner only)
     * @param newCost New mint cost in CA tokens (with 18 decimals)
     */
    function updateMintCost(uint256 newCost) external onlyOwner {
        require(newCost > 0, "Cost must be > 0");
        uint256 oldCost = mintCost;
        mintCost = newCost;
        emit MintCostUpdated(oldCost, newCost);
    }

    // ============ Token URI ============

    /**
     * @notice Generate token URI with on-chain metadata
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        Gear memory gear = gears[tokenId];

        string memory attributes = _buildAttributes(gear);
        string memory json = string(abi.encodePacked(
            '{"name":"', gear.name, '",',
            '"description":"Cro Army Gear NFT V2 - ', gear.gearType, '",',
            '"image":"', gear.imageUrl, '",',
            '"attributes":', attributes, '}'
        ));

        return string(abi.encodePacked(
            'data:application/json;base64,',
            _base64Encode(bytes(json))
        ));
    }

    function _buildAttributes(Gear memory gear) private pure returns (string memory) {
        string memory rarityName = _getRarityName(gear.rarity);

        return string(abi.encodePacked(
            '[',
            '{"trait_type":"Type","value":"', gear.gearType, '"},',
            '{"trait_type":"Rarity","value":"', rarityName, '"},',
            '{"trait_type":"Power","value":', gear.totalPower.toString(), '},',
            '{"trait_type":"Equipped","value":', gear.equippedTo > 0 ? "true" : "false", '}',
            ']'
        ));
    }

    function _getRarityName(uint8 rarity) private pure returns (string memory) {
        if (rarity == RARITY_COMMON) return "Common";
        if (rarity == RARITY_RARE) return "Rare";
        if (rarity == RARITY_EPIC) return "Epic";
        if (rarity == RARITY_LEGENDARY) return "Legendary";
        return "Unknown";
    }

    // Simple base64 encoding for JSON
    function _base64Encode(bytes memory data) private pure returns (string memory) {
        string memory base64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        bytes memory result = new bytes((data.length + 2) / 3 * 4);

        uint256 i = 0;
        uint256 j = 0;

        while (i < data.length) {
            uint256 a = i < data.length ? uint8(data[i++]) : 0;
            uint256 b = i < data.length ? uint8(data[i++]) : 0;
            uint256 c = i < data.length ? uint8(data[i++]) : 0;

            uint256 triple = (a << 16) | (b << 8) | c;

            result[j++] = bytes(base64chars)[(triple >> 18) & 0x3F];
            result[j++] = bytes(base64chars)[(triple >> 12) & 0x3F];
            result[j++] = i - 2 < data.length ? bytes(base64chars)[(triple >> 6) & 0x3F] : bytes("=")[0];
            result[j++] = i - 1 < data.length ? bytes(base64chars)[triple & 0x3F] : bytes("=")[0];
        }

        return string(result);
    }

    // ============ Override Transfer to Handle Equipment ============

    /**
     * @notice Override transfer to unequip gear when transferred
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        // Unequip gear when transferred
        if (from != address(0) && to != address(0)) {
            Gear storage gear = gears[tokenId];
            if (gear.equippedTo != 0) {
                _removeGearFromSoldier(gear.equippedTo, tokenId);
                gear.equippedTo = 0;
                emit GearUnequipped(tokenId, gear.equippedTo);
            }
        }

        return super._update(to, tokenId, auth);
    }
}