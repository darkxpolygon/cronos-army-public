'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useDemoMode } from '@/app/hooks/useDemoMode';
import DemoBanner from '@/app/components/demo/DemoBanner';
import DemoConversionModal from '@/app/components/demo/DemoConversionModal';
import { Card } from '@/app/components/ui/Card';
import { Button } from '@/app/components/ui/Button';
import { Badge } from '@/app/components/ui/Badge';
import OptimizedImage from '@/app/components/ui/OptimizedImage';
import ConnectWalletButton from '@/app/components/soldiers/ConnectWalletButton';
import { api } from '@/app/lib/api-client';
import { getSoldierImageUrl } from '@/app/lib/utils/assets/images';
import { formatRank } from '@/app/lib/utils/soldier/display';
import { getErrorMessage } from '@/app/lib/utils/type-helpers';
import toast, { Toaster } from 'react-hot-toast';
import {
  Info,
  Settings,
  TrendingUp,
  Coins,
  DoorOpen,
  Map,
  Globe,
  Target,
  Shield,
  Clock,
  Zap
} from 'lucide-react';
import BattleAnimation from './BattleAnimation';
import WorldMap from './WorldMap';
import MobileWorldMap from './MobileWorldMap';
import ScoutingModal from '@/app/components/battles/ScoutingModal';
import StrategySelectionModal, { type BattleStrategy } from '@/app/components/battles/StrategySelectionModal';
import RoundResultsModal from '@/app/components/battles/RoundResultsModal';
import EnergyRestoreModal from '@/app/soldiers/components/EnergyRestoreModal';
import BattleVideoOverlay from '@/app/components/battles/BattleVideoOverlay';
import { UnifiedSiegeScreenV2 } from '@/app/components/progressive-siege-v2';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import { useCABalance } from '@/app/hooks/useCABalance';
import { useDeviceType } from '@/app/lib/utils/device';
import PanelContainer from '@/app/components/ui/PanelContainer';
import TerritoryDetailsPanel from '@/app/components/territories/TerritoryDetailsPanel';
import SquadManagementPanel from '@/app/components/territories/SquadManagementPanel';
import StakeManagementPanel from '@/app/components/territories/StakeManagementPanel';
import CAStakingPanel from '@/app/components/territories/CAStakingPanel';
import './battlefield-effects.css';

interface Soldier {
  id: string;
  tokenId: number;
  name: string;
  image: string;
  rank?: string;
  power?: number;
  level?: string;
  xp?: number;
  imageUrl?: string;
  energy?: number; // Current energy percentage (0-100)
  isTraining?: boolean; // Whether soldier is currently training
  trainingCompletesAt?: string | null; // When training completes
}

interface Territory {
  id: number;
  name: string;
  tier: string;
  stakeRequired: number;
  baseRewardPerHour: number;
  defenseBonus: number;
  owner: string | null;
  soldier?: {
    id: string;
    name: string;
    power?: number;
    imageUrl?: string;
    rank?: string;
    xp?: number;
    energy?: number;
  };
  soldiers?: Soldier[];
  squad_size?: number;
  position?: { x: number; y: number };
  cooldown_until?: string; // 3-hour conquest protection
  stakedAmount?: number;
  stakeMultiplier?: number;
  earningsActive?: boolean;
}

interface V2SoldierResponse {
  id: string;
  tokenId: number;
  name: string;
  imageUrl: string;
  rank: string;
  effectivePower: number;
  level: number;
  currentEnergy: number;
}

interface RoundSoldier {
  id: string;
  name: string;
  power?: number;
  health?: number;
  energy: number;
}

// Energy Bar Component
function EnergyBar({ energy, size = 'small' }: { energy: number; size?: 'small' | 'medium' }) {
  const getEnergyColor = (energy: number) => {
    if (energy >= 75) return 'bg-green-500';
    if (energy >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getEnergyGlow = (energy: number) => {
    if (energy >= 75) return 'shadow-green-500/50';
    if (energy >= 40) return 'shadow-yellow-500/50';
    return 'shadow-red-500/50';
  };

  const height = size === 'small' ? 'h-1' : 'h-1.5';

  return (
    <div className="w-full">
      <div className={`w-full ${height} bg-gray-800 rounded-full overflow-hidden`}>
        <div
          className={`${height} ${getEnergyColor(energy)} ${getEnergyGlow(energy)} shadow-lg transition-all duration-300 rounded-full`}
          style={{ width: `${energy}%` }}
        />
      </div>
      <div className="text-[9px] text-gray-400 text-center mt-0.5">{Math.round(energy)}%</div>
    </div>
  );
}

export default function BattlefieldContent() {
  const { address, isConnected } = useAccount();
  const {
    isDemoMode,
    demoWalletAddress,
    showConversionModal,
    trackInteraction,
    exitDemoMode,
    dismissConversionModal
  } = useDemoMode();
  const isMobile = useIsMobile(768);
  const { isCDCWallet } = useDeviceType();
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(false);

  // Set demo wallet in API client when in demo mode
  useEffect(() => {
    if (isDemoMode && demoWalletAddress) {
      api.setDemoWallet(demoWalletAddress);
    } else {
      api.setDemoWallet(null);
    }
  }, [isDemoMode, demoWalletAddress]);
  const [loadingTerritories, setLoadingTerritories] = useState(true);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [clickedTerritoryId, setClickedTerritoryId] = useState<number | null>(null);
  const [clickedSoldierId, setClickedSoldierId] = useState<string | null>(null);
  const [battleZone, setBattleZone] = useState<Soldier[]>([]);
  const [draggedSoldier, setDraggedSoldier] = useState<Soldier | null>(null);
  const [touchDragging, setTouchDragging] = useState(false);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [touchCurrentPos, setTouchCurrentPos] = useState<{ x: number; y: number } | null>(null);

  // View mode and battle animation
  const [viewMode, setViewMode] = useState<'worldmap' | 'focused'>('focused');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [showBattleAnimation, setShowBattleAnimation] = useState(false);
  const [battleData, setBattleData] = useState<{
    attackers: Array<{
      id: string;
      name: string;
      image: string;
      power: number;
    }>;
    defenders: Array<{
      id: string;
      name: string;
      power: number;
      imageUrl?: string;
    }>;
    territory: Territory;
    serverVictory: boolean;
  } | null>(null);
  const [reSelectTerritoryId, setReSelectTerritoryId] = useState<number | null>(null);

  // Multi-round battle state - v2 tactical system
  const [currentBattleId, setCurrentBattleId] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(3);
  const [roundResults, setRoundResults] = useState<any[]>([]);

  // New tactical battle modals
  const [showScoutingModal, setShowScoutingModal] = useState(false);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [showRoundResultsModal, setShowRoundResultsModal] = useState(false);

  // Energy restore modal
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [soldierToRestore, setSoldierToRestore] = useState<Soldier | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Battle video overlay
  const [showBattleVideo, setShowBattleVideo] = useState(false);

  // Battle state data
  const [battleAttackerSoldiers, setBattleAttackerSoldiers] = useState<Array<{id: string; name: string; energy: number}>>([]);
  const [battleDefenderSoldiers, setBattleDefenderSoldiers] = useState<Array<{id: string; name: string; energy: number}>>([]);
  const [scoutIntel, setScoutIntel] = useState<{revealedStrategy?: BattleStrategy; attackBonus: number} | undefined>(undefined);
  const [lastRoundResult, setLastRoundResult] = useState<any>(null);
  const [isBattleComplete, setIsBattleComplete] = useState(false);

  // Video playback state - track which territories have played video this session
  const [playingVideo, setPlayingVideo] = useState(false);
  const [playedVideoTerritories, setPlayedVideoTerritories] = useState<Set<number>>(new Set());
  const [videoLoading, setVideoLoading] = useState(false);
  const [hasPlayedWorldmapVideo, setHasPlayedWorldmapVideo] = useState(false);
  const [forceBattleVideoReplay, setForceBattleVideoReplay] = useState(false);

  // Hide loading screen immediately for CDC Wallet or mobile (no video to load)
  useEffect(() => {
    if (isCDCWallet || isMobile) {
      setVideoLoading(false);
    }
  }, [isCDCWallet, isMobile]);

  // Safety timeout to prevent black screen getting stuck
  useEffect(() => {
    if (videoLoading) {
      const timeout = setTimeout(() => {
        console.log('⚠️ Video loading timeout - forcing hide');
        setVideoLoading(false);
      }, 3000); // 3 second safety timeout

      return () => clearTimeout(timeout);
    }
  }, [videoLoading]);

  // Progressive Siege state
  const [showProgressiveSiege, setShowProgressiveSiege] = useState(false);

  // Panel state
  const [showTerritoryPanel, setShowTerritoryPanel] = useState(false);
  const [panelTerritory, setPanelTerritory] = useState<Territory | null>(null);
  const [showSquadPanel, setShowSquadPanel] = useState(false);
  const [squadTerritoryId, setSquadTerritoryId] = useState<number | null>(null);
  const [squadTerritoryName, setSquadTerritoryName] = useState<string>('');
  const [showStakePanel, setShowStakePanel] = useState(false);
  const [showCAStakingPanel, setShowCAStakingPanel] = useState(false);
  const [caBalance, setCABalance] = useState(0);
  const [stakedCABalance, setStakedCABalance] = useState(0);

  // Use the hook to get wallet CA balance from blockchain
  const { balance: walletCABalance } = useCABalance();
  const [preSelectedSoldierId, setPreSelectedSoldierId] = useState<string | undefined>(undefined);

  // Helper function to get territory background image
  const getTerritoryImage = (territoryName: string): string | null => {
    // Convert territory name to snake_case filename
    const fileName = territoryName
      .toLowerCase()
      .replace(/['\s]/g, (match) => match === ' ' ? '_' : '')
      .replace(/[^a-z0-9_]/g, '');

    // Serve WebP for better performance (96% smaller than PNG)
    // Browsers automatically fall back to PNG if WebP isn't supported
    return `/assets/territories/static/${fileName}.webp`;
  };

  // Map of territory videos with correct file extensions (mixed case)
  const TERRITORY_VIDEO_EXTENSIONS: Record<string, 'mp4' | 'MP4'> = {
    'amber_woods': 'MP4',
    'central_plains': 'MP4',
    'crossroads': 'MP4',
    'desert_outpost': 'MP4',
    'dragons_crown': 'MP4',
    'eastern_gate': 'MP4',
    'fort_cronos': 'MP4',
    'frost_bridge': 'MP4',
    'frozen_peaks': 'MP4',
    'golden_fields': 'MP4',
    'heartland': 'MP4',
    'ice_harbor': 'MP4',
    'kings_road': 'MP4',
    'merchants_haven': 'mp4',
    'northern_watch': 'MP4',
    'oasis_rest': 'mp4',
    'obsidian_throne': 'mp4',
    'river_crossing': 'mp4',
    'sandy_shore': 'mp4',
    'scorched_earth': 'mp4',
    'snowfall_valley': 'MP4',
    'southern_tip': 'mp4',
    'tundra_march': 'MP4',
    'white_plains': 'mp4',
    'wolfs_den': 'mp4',
  };

  // Helper function to get territory video
  const getTerritoryVideo = (territoryName: string): string | null => {
    const fileName = territoryName
      .toLowerCase()
      .replace(/['\s]/g, (match) => match === ' ' ? '_' : '')
      .replace(/[^a-z0-9_]/g, '');

    // Get correct extension from map, fallback to MP4
    const extension = TERRITORY_VIDEO_EXTENSIONS[fileName] || 'MP4';

    return `/assets/territories/vids/${fileName}.${extension}`;
  };

  // Helper function to format time remaining
  const getTimeRemaining = (endTime: string) => {
    const now = new Date();
    const end = new Date(endTime);
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return 'Ended';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  // Fetch territories
  const fetchTerritories = useCallback(async () => {
    setLoadingTerritories(true);
    try {
      const data = await api.get<any>('/api/territories');
      if (data.territories) {
        setTerritories(data.territories);
      }
    } catch (error) {
      console.error('Error fetching territories:', error);
      toast.error('Failed to load territories');
    } finally {
      setLoadingTerritories(false);
    }
  }, []);

  // Fetch CA staked balance from database
  const fetchCABalance = useCallback(async () => {
    if (!address) return;

    try {
      // Get staked balance from database
      const response = await api.get<any>(`/api/territories/idle-ca?wallet=${address}`);
      const staked = response.total_staked_onchain || 0;
      setStakedCABalance(staked);
      setCABalance(staked); // For backward compatibility
    } catch (error) {
      console.error('Error fetching CA balance:', error);
    }
  }, [address]);

  // ✨ V2 API: Fetch user's soldiers with all data pre-calculated
  const fetchSoldiers = useCallback(async () => {
    const walletToFetch = isDemoMode ? demoWalletAddress : address;
    if (!walletToFetch) return;

    setLoading(true);
    try {
      // ✨ One simple API call - ALWAYS FRESH (no cache for energy data)
      // Add timestamp to bust any aggressive caching
      const timestamp = Date.now();
      const response = await fetch(`/api/v2/soldiers/by-wallet?wallet=${walletToFetch}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch soldiers');
      }

      const data = await response.json();

      // Map V2 response to component format
      const soldiersWithPower = data.soldiers.map((soldier: V2SoldierResponse) => {
        // Use nullish coalescing but handle 0 correctly (0 is a valid energy value)
        const finalEnergy = soldier.currentEnergy !== undefined && soldier.currentEnergy !== null
          ? soldier.currentEnergy
          : (soldier.energy !== undefined && soldier.energy !== null ? soldier.energy : 100);
        return {
          id: soldier.id,
          tokenId: soldier.tokenId,
          name: soldier.name,
          image: soldier.imageUrl,
          rank: soldier.rank,
          power: soldier.effectivePower, // ✨ Pre-calculated with gear!
          level: `level_${soldier.level}`,
          energy: finalEnergy // ✨ Pre-calculated!
        };
      });
      setSoldiers(soldiersWithPower);

      // Update battleZone soldiers with fresh data (energy, power, etc.)
      // Use functional update to avoid stale closure
      setBattleZone(currentBattleZone => {
        if (currentBattleZone.length === 0) return currentBattleZone;

        return currentBattleZone.map(zoneSoldier => {
          const freshSoldier = soldiersWithPower.find((s: any) => s.id === zoneSoldier.id);
          return freshSoldier || zoneSoldier; // Use fresh data if found, otherwise keep old
        });
      });
    } catch (error) {
      console.error('Error fetching soldiers:', error);
      toast.error('Failed to load soldiers');
    } finally {
      setLoading(false);
    }
  }, [address, isDemoMode, demoWalletAddress]);

  useEffect(() => {
    fetchTerritories();
  }, [fetchTerritories]);

  useEffect(() => {
    if ((isConnected && address) || (isDemoMode && demoWalletAddress)) {
      fetchSoldiers();
      if (!isDemoMode) {
        fetchCABalance();
      }
    }
  }, [isConnected, address, isDemoMode, demoWalletAddress, fetchSoldiers, fetchCABalance]);

  // No auto-select - let user choose territory or show worldmap background
  // (Removed auto-selection to allow worldmap video/image to show initially)

  // Re-select territory after battle refresh
  useEffect(() => {
    if (reSelectTerritoryId && territories.length > 0) {
      const territoryToSelect = territories.find(t => t.id === reSelectTerritoryId);
      if (territoryToSelect) {
        setSelectedTerritory(territoryToSelect);
        setReSelectTerritoryId(null);
      }
    }
  }, [reSelectTerritoryId, territories]);

  // Play worldmap video on initial load (when no territory is selected) - DESKTOP ONLY
  useEffect(() => {
    if (!selectedTerritory && viewMode === 'focused' && !hasPlayedWorldmapVideo && !isCDCWallet && !isMobile) {
      setPlayingVideo(true);
      setVideoLoading(true);
    }
  }, [selectedTerritory, viewMode, hasPlayedWorldmapVideo, isCDCWallet, isMobile]);

  // Trigger video playback when territory is selected (once per territory per session) - DESKTOP ONLY
  useEffect(() => {
    if (selectedTerritory && viewMode === 'focused' && !playedVideoTerritories.has(selectedTerritory.id) && !isCDCWallet && !isMobile) {
      const hasVideo = getTerritoryVideo(selectedTerritory.name);

      if (hasVideo) {
        setPlayingVideo(true);
        // ✅ DON'T show black overlay - let previous background show while loading
        // setVideoLoading(true); // ❌ REMOVED - causes black flash
      }
    }
  }, [selectedTerritory, viewMode, playedVideoTerritories, isCDCWallet, isMobile]);

  // Drag handlers
  const handleDragStart = (soldier: Soldier) => {
    setDraggedSoldier(soldier);
  };

  const handleDragEnd = () => {
    setDraggedSoldier(null);
  };

  const handleDropToBattleZone = () => {
    if (draggedSoldier && !battleZone.find(s => s.id === draggedSoldier.id)) {
      setBattleZone([...battleZone, draggedSoldier]);
      
    }
    setDraggedSoldier(null);
  };

  const handleRemoveFromBattleZone = (soldierId: string) => {
    setBattleZone(battleZone.filter(s => s.id !== soldierId));
  };

  // Touch drag handlers for mobile
  const handleTouchStart = (soldier: Soldier, e: React.TouchEvent) => {
    if (!soldier) return;
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    setDraggedSoldier(soldier);

    // Delay setting touchDragging to avoid triggering on simple taps
    setTimeout(() => {
      setTouchDragging(true);
    }, 100);

    // Prevent scrolling when starting to drag
    if (isMobile) {
      document.body.style.overflow = 'hidden';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.y);

    // Update current touch position for visual feedback
    setTouchCurrentPos({ x: touch.clientX, y: touch.clientY });

    // If moved more than 10px, consider it a drag
    if (deltaX > 10 || deltaY > 10) {
      setTouchDragging(true);
      // Prevent scrolling while dragging
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Re-enable scrolling after drag
    if (isMobile) {
      document.body.style.overflow = '';
    }

    if (!touchDragging || !draggedSoldier) {
      setTouchDragging(false);
      setTouchStartPos(null);
      setDraggedSoldier(null);
      return;
    }

    const touch = e.changedTouches[0];
    const dropElement = document.elementFromPoint(touch.clientX, touch.clientY);

    // Check if dropped in battle zone
    const battleZoneElement = dropElement?.closest('[data-drop-zone="battle"]');
    if (battleZoneElement && !battleZone.find(s => s.id === draggedSoldier.id)) {
      setBattleZone([...battleZone, draggedSoldier]);
    }

    setDraggedSoldier(null);
    setTouchDragging(false);
    setTouchStartPos(null);
    setTouchCurrentPos(null);
  };

  // Calculate total power
  const totalAttackPower = battleZone.reduce((sum, s) => sum + (s.power || 0), 0);

  // Get set of soldiers that are defending territories
  const defendingSoldierIds = new Set<string>();
  territories.forEach(territory => {
    // Check single soldier defense
    if (territory.soldier?.id) {
      defendingSoldierIds.add(territory.soldier.id);
    }
    // Check squad defense
    if (territory.soldiers && Array.isArray(territory.soldiers)) {
      territory.soldiers.forEach(soldier => {
        if (soldier.id) {
          defendingSoldierIds.add(soldier.id);
        }
      });
    }
  });

  // Calculate defense power of selected territory
  const defenderPower = selectedTerritory
    ? (selectedTerritory.soldiers && selectedTerritory.soldiers.length > 0
        ? selectedTerritory.soldiers.reduce((sum, s) => sum + (s.power || 0), 0)
        : selectedTerritory.soldier?.power || 300) // Default AI defense
    : 0;

  const successRate = selectedTerritory && defenderPower > 0
    ? Math.min(95, Math.max(5, Math.round((totalAttackPower / defenderPower) * 100)))
    : 0;

  // Attack handler - NEW V2 Tactical Battle System
  const handleAttack = async () => {
    // Prevent multiple clicks
    if (isAttacking) {
      return;
    }

    if (battleZone.length === 0) {
      toast.error('Deploy at least one soldier to attack!');
      return;
    }

    if (!selectedTerritory) {
      toast.error('Select a territory to attack!');
      return;
    }

    // Prevent attacking own territory
    if (selectedTerritory.owner?.toLowerCase() === address?.toLowerCase()) {
      toast.error('Cannot attack your own territory!');
      return;
    }

    // Set attacking state immediately to prevent double clicks
    setIsAttacking(true);

    // Call new v2 battle init API
    try {
      const apiResult = await api.post<any>('/api/v2/territories/battle/init', {
        territoryId: selectedTerritory.id,
        soldierIds: battleZone.map(s => s.id)
      });

      if (!apiResult.success) {
        throw new Error(apiResult.error || 'Battle failed to start');
      }

      // Store battle state
      setCurrentBattleId(apiResult.battleId);
      setMaxRounds(apiResult.maxRounds);
      setCurrentRound(1);
      setBattleAttackerSoldiers(apiResult.attackerSoldiers);
      setBattleDefenderSoldiers(apiResult.defenderSoldiers);
      setScoutIntel(undefined); // Reset scout intel
      setIsBattleComplete(false); // Reset battle completion flag

      // Refresh soldiers to show updated energy after battle init deduction
      fetchSoldiers();

      // Show scouting modal (Phase 1)
      setIsAttacking(false);
      setShowScoutingModal(true);
    } catch (error: unknown) {
      console.error('Attack failed:', error);
      toast.error(error.message || 'Attack failed');
      setIsAttacking(false);
    }
  };

  // Handle progressive siege attack
  const handleProgressiveSiege = () => {
    // Validation
    if (battleZone.length === 0) {
      toast.error('Deploy at least one soldier to attack!');
      return;
    }

    if (!selectedTerritory) {
      toast.error('Select a territory to attack!');
      return;
    }

    // Prevent attacking own territory
    if (selectedTerritory.owner?.toLowerCase() === address?.toLowerCase()) {
      toast.error('Cannot attack your own territory!');
      return;
    }

    // Launch progressive siege
    setShowProgressiveSiege(true);
  };

  // Handle progressive siege completion
  const handleProgressiveSiegeComplete = (victory: boolean) => {
    if (victory) {
      toast.success('🎉 Territory Captured!');
      fetchTerritories(); // Refresh territory list
    } else {
      toast.error('Siege Failed - Try Again');
    }

    setShowProgressiveSiege(false);
    fetchSoldiers(); // Refresh soldiers (always fresh, no cache)

    // Clear battle zone on completion
    setBattleZone([]);
  };

  // Handle scouting phase
  const handleScout = async (scoutSoldierId: string) => {
    if (!currentBattleId) return;

    try {
      setIsAttacking(true);
      const result = await api.post<any>('/api/v2/territories/battle/scout', {
        battleId: currentBattleId,
        scoutSoldierId
      });

      if (!result.success) {
        throw new Error('Scouting failed');
      }

      // Store scout intel with actual attack bonus
      const attackBonus = result.attackBonus || 0;
      const scoutingSuccessful = result.scoutingSuccessful || attackBonus > 0;

      setScoutIntel({
        attackBonus,
        scoutingSuccessful
      });

      if (scoutingSuccessful) {
        toast.success(`🎯 Scouting successful! Scout gained +${attackBonus}% attack bonus!`);
      } else {
        toast.error(`❌ Scouting failed! Scout was not able to gather useful intel.`);
      }

      // Close scouting modal and show strategy modal
      setShowScoutingModal(false);
      setIsAttacking(false);
      setShowStrategyModal(true);
    } catch (error: unknown) {
      console.error('Scouting failed:', error);
      toast.error(error.message || 'Scouting failed');
      setIsAttacking(false);
    }
  };

  // Handle skip scouting
  const handleSkipScouting = async () => {
    setScoutIntel(null); // null = no scouting was performed
    setShowScoutingModal(false);
    setShowStrategyModal(true);
  };

  // Handle battle video end
  const handleBattleVideoEnd = () => {
    setShowBattleVideo(false);
    setIsAttacking(false);
    setShowRoundResultsModal(true);

    // Refresh soldiers to update energy levels after round
    fetchSoldiers();
  };

  // Handle strategy selection and round execution
  const handleStrategySelection = async (strategy: BattleStrategy) => {
    if (!currentBattleId) return;

    try {
      setShowStrategyModal(false);
      setIsAttacking(true);

      // Show fullscreen battle video while round executes
      setShowBattleVideo(true);

      // Execute round with selected strategy (runs in parallel with video)
      const result = await api.post<any>('/api/v2/territories/battle/execute-round', {
        battleId: currentBattleId,
        attackerStrategy: strategy,
        scoutBonus: scoutIntel?.attackBonus || 0
      });

      if (!result.success) {
        throw new Error('Round execution failed');
      }

      // Store round result
      setLastRoundResult(result.roundResult);
      setRoundResults(prev => [...prev, result.roundResult]);

      // Update soldier states for next round
      const updatedAttackers = result.roundResult.attackerSoldiers.map((s: RoundSoldier) => ({
        id: s.id,
        name: s.name,
        energy: s.energyAfter
      }));
      const updatedDefenders = result.roundResult.defenderSoldiers.map((s: RoundSoldier) => ({
        id: s.id,
        name: s.name,
        energy: s.energyAfter
      }));
      setBattleAttackerSoldiers(updatedAttackers);
      setBattleDefenderSoldiers(updatedDefenders);

      // Clear scout bonus after first round
      if (scoutIntel?.attackBonus && scoutIntel.attackBonus > 0) {
        setScoutIntel({ attackBonus: 0 });
      }

      // Check if battle is complete
      if (result.battleComplete) {
        // Battle ended - show final results in modal after video
        // V2 battle system uses round results modal only, no old animation
        console.log('[handleStrategySelection] Battle complete:', result.victory ? 'Victory!' : 'Defeat');
        console.log('[handleStrategySelection] Setting isBattleComplete to TRUE');
        setIsBattleComplete(true);
      } else {
        console.log('[handleStrategySelection] Battle continues, setting isBattleComplete to FALSE');
        setIsBattleComplete(false);
      }
      // If battle continues, video will end and show round results via handleBattleVideoEnd
    } catch (error: unknown) {
      console.error('Round execution failed:', error);
      toast.error(error.message || 'Round execution failed');
      setIsAttacking(false);
    }
  };

  // Handle continue from round results modal
  const handleContinueFromResults = async () => {
    if (!currentBattleId) return;

    try {
      setShowRoundResultsModal(false);
      setIsAttacking(true);

      // Show fullscreen battle video
      setShowBattleVideo(true);

      // Continue to next round via API
      await api.post('/api/v2/territories/battle/continue', {
        battleId: currentBattleId
      });

      // Increment round counter
      setCurrentRound(prev => prev + 1);

      // After Round 1, strategy is locked - automatically execute next round with same strategy
      // Defender strategy will be re-calculated by AI based on current energy levels
      const result = await api.post<any>('/api/v2/territories/battle/execute-round', {
        battleId: currentBattleId,
        attackerStrategy: lastRoundResult.attackerStrategy,
        scoutBonus: 0 // Scout bonus only applies to Round 1
      });

      if (!result.success) {
        throw new Error('Round execution failed');
      }

      // Store round result
      setLastRoundResult(result.roundResult);
      setRoundResults(prev => [...prev, result.roundResult]);

      // Update soldier states
      const updatedAttackers = result.roundResult.attackerSoldiers.map((s: any) => ({
        id: s.id,
        name: s.name,
        energy: s.energyAfter
      }));
      const updatedDefenders = result.roundResult.defenderSoldiers.map((s: any) => ({
        id: s.id,
        name: s.name,
        energy: s.energyAfter
      }));
      setBattleAttackerSoldiers(updatedAttackers);
      setBattleDefenderSoldiers(updatedDefenders);

      // Check if battle is complete
      if (result.battleComplete) {
        // Battle ended - show final results in modal after video
        // V2 battle system uses round results modal only, no old animation
        console.log('[handleContinueFromResults] Battle complete:', result.victory ? 'Victory!' : 'Defeat');
        console.log('[handleContinueFromResults] Setting isBattleComplete to TRUE');
        setIsBattleComplete(true);
      } else {
        console.log('[handleContinueFromResults] Battle continues, setting isBattleComplete to FALSE');
        setIsBattleComplete(false);
      }
      // If battle continues, video will end and show round results via handleBattleVideoEnd
    } catch (error: unknown) {
      console.error('Error continuing battle:', error);
      toast.error(error.message || 'Failed to continue battle');
      setIsAttacking(false);
    }
  };

  // Handle retreat from round results modal
  const handleRetreatFromResults = async () => {
    if (!currentBattleId) return;

    try {
      setShowRoundResultsModal(false);
      setIsAttacking(true);

      await api.post('/api/v2/territories/battle/retreat', {
        battleId: currentBattleId
      });

      toast('🏳️ Retreated from battle. Territory on 15-min cooldown.');

      // Reset battle state
      setCurrentBattleId(null);
      setRoundResults([]);
      setBattleZone([]);
      setIsAttacking(false);
      setIsBattleComplete(false);

      // Refresh territories and soldiers
      fetchTerritories();
      fetchSoldiers();
    } catch (error: unknown) {
      console.error('Error retreating:', error);
      toast.error(error.message || 'Failed to retreat');
      setIsAttacking(false);
    }
  };

  // Handle battle animation completion
  const handleBattleComplete = async (result: { success: boolean; message: string }) => {
    setShowBattleAnimation(false);
    setIsAttacking(false); // Reset attacking state when animation completes

    // Store the attacked territory ID to re-select it after refresh
    const attackedTerritoryId = battleData?.territory.id;

    // Battle animation only plays when battle is complete, so we're done here
    // Send notifications and cleanup
    if (battleData && battleData.attackers.length > 0) {
      try {
        await api.post('/api/notifications/battle-result', {
          victory: result.success,
          territoryName: battleData.territory.name,
          territoryId: battleData.territory.id,
          territoryTier: (battleData.territory as any).tier || 'common',
          soldierName: battleData.attackers[0].name, // Strongest attacker
          squadSize: battleData.attackers.length,
          defenderName: battleData.defenders.length > 0 ? battleData.defenders[0].name : undefined,
          defenderAddress: (battleData.territory as any).owner,
          previousOwner: (battleData.territory as any).owner
        });
      } catch (error) {
        console.error('Failed to send battle notification:', error);
        // Don't show error to user - notifications are non-critical
      }
    }

    if (result.success) {
      toast.success(result.message);
      // Set the territory ID to re-select after refresh
      if (attackedTerritoryId) {
        setReSelectTerritoryId(attackedTerritoryId);
      }
      // Refresh territories to show updated ownership
      fetchTerritories();
    } else {
      toast.error(result.message);
    }

    // Refresh soldiers to update energy levels in carousel
    fetchSoldiers();

    // Clear battle zone and state
    setBattleZone([]);
    setBattleData(null);
    setCurrentBattleId(null);
    setRoundResults([]);
    setIsBattleComplete(false);
  };

  // Handle territory click from world map
  const handleTerritoryClickFromMap = (territory: Territory) => {
    setIsTransitioning(true);
    setSelectedTerritory(territory);

    // Trigger zoom animation, then switch view
    setTimeout(() => {
      setViewMode('focused');
      setBattleZone([]);
    }, 400);

    setTimeout(() => {
      setIsTransitioning(false);
    }, 500);
  };

  // Toggle back to world map
  const handleBackToWorldMap = () => {
    setIsTransitioning(true);

    // Trigger zoom out animation, then switch view
    setTimeout(() => {
      setViewMode('worldmap');
      setSelectedTerritory(null);
      setBattleZone([]);
      setClickedTerritoryId(null);
    }, 400);

    setTimeout(() => {
      setIsTransitioning(false);
    }, 500);
  };

  // Handle energy restore
  const handleOpenRestoreModal = (soldier: Soldier) => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    if (soldier.energy && soldier.energy >= 100) {
      toast.error('Soldier is already at full energy');
      return;
    }

    setSoldierToRestore(soldier);
    setShowRestoreModal(true);
  };

  const handleConfirmRestore = async () => {
    if (!address || !soldierToRestore) {
      toast.error('Please connect your wallet');
      return;
    }

    console.log('[Recharge] Soldier to restore:', {
      id: soldierToRestore.id,
      name: soldierToRestore.name,
      displayedEnergy: soldierToRestore.energy
    });

    setIsRestoring(true);
    try {
      const response = await fetch(`/api/v2/soldiers/${soldierToRestore.id}/energy/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to restore energy');
      }

      const data = await response.json();
      toast.success(`Energy restored! Spent ${data.credits_spent.toFixed(2)} credits`);

      // Close modal first
      setShowRestoreModal(false);
      setSoldierToRestore(null);

      // Immediately refresh from database to show updated energy
      fetchSoldiers();
    } catch (error: any) {
      console.error('Error restoring energy:', error);
      toast.error(error.message || 'Failed to restore energy');
    } finally {
      setIsRestoring(false);
    }
  };

  // Hide all headers in gaming mode
  useEffect(() => {
    // Allow scrolling on mobile, prevent on desktop
    if (!isMobile) {
      document.body.style.overflow = 'hidden';
    }

    // Find and hide all header-related elements
    const selectors = [
      'header',
      'nav',
      '[class*="Header"]',
      '[class*="header"]',
      '[class*="Navbar"]',
      '[class*="navbar"]',
      '[class*="TopBar"]',
      '[class*="topbar"]'
    ];

    const elementsToHide: HTMLElement[] = [];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const htmlEl = el as HTMLElement;
        // Only hide if it's in the top 200px of the page
        const rect = htmlEl.getBoundingClientRect();
        if (rect.top < 200) {
          htmlEl.style.display = 'none';
          elementsToHide.push(htmlEl);
        }
      });
    });

    return () => {
      if (!isMobile) {
        document.body.style.overflow = '';
      }
      elementsToHide.forEach(el => {
        el.style.display = '';
      });
    };
  }, [isMobile]);

  // Allow viewing in demo mode even without wallet
  if (!isConnected && !isDemoMode) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        {/* Epic battlefield background */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(/assets/worldmap/worldmap_static.webp)`,
            filter: 'brightness(0.4)'
          }}
        />

        {/* Gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70" />

        <main className="relative z-10 h-full flex items-center justify-center px-4">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-8">
              <h2 className="text-4xl font-bold text-white mb-4 drop-shadow-lg">
                ⚔️ Battlefield Command Center
              </h2>
              <p className="text-gray-300 text-lg max-w-2xl drop-shadow-md">
                Connect your wallet to command your army
              </p>
            </div>
            <Card variant="default" padding="lg" className="max-w-md bg-black/80 backdrop-blur-sm border-cyan-500/30">
              <ConnectWalletButton />
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // Mobile World Map only - use desktop battlefield for focused view
  if (isMobile && viewMode === 'worldmap') {
    return (
      <>
        <MobileWorldMap
          territories={territories}
          userAddress={address}
          onTerritoryClick={handleTerritoryClickFromMap}
          getTerritoryImage={getTerritoryImage}
        />

        {/* All Panels - Shared between mobile and desktop */}
        {panelTerritory && (
          <TerritoryDetailsPanel
            isOpen={showTerritoryPanel}
            territory={panelTerritory}
            onClose={() => {
              setShowTerritoryPanel(false);
              setPanelTerritory(null);
            }}
            currentWallet={address}
            onSquadManage={(territoryId) => {
              setSquadTerritoryId(territoryId);
              setSquadTerritoryName(panelTerritory.name);
              setShowSquadPanel(true);
              setShowTerritoryPanel(false);
            }}
          />
        )}

        {squadTerritoryId && (
          <SquadManagementPanel
            isOpen={showSquadPanel}
            territoryId={squadTerritoryId}
            territoryName={squadTerritoryName}
            onClose={() => {
              setShowSquadPanel(false);
              setSquadTerritoryId(null);
              setSquadTerritoryName('');
            }}
            onBack={() => {
              // Go back to territory details panel
              setShowSquadPanel(false);
              setShowTerritoryPanel(true);
            }}
            currentWallet={address || ''}
            availableSoldiers={soldiers.map(s => ({
              id: s.id,
              name: s.name,
              rank: s.rank || '',
              power: s.power,
              image: s.image,
              imageUrl: getSoldierImageUrl(s)
            }))}
          />
        )}

        <StakeManagementPanel
          isOpen={showStakePanel}
          onClose={() => setShowStakePanel(false)}
          territories={territories.filter(t => t.owner?.toLowerCase() === address?.toLowerCase())}
          walletAddress={address || ''}
          totalCABalance={walletCABalance}
          totalStakedAmount={stakedCABalance}
          onStakeUpdate={() => {
            fetchTerritories();
            fetchCABalance();
          }}
        />
      </>
    );
  }

  // Desktop battlefield (also used for mobile focused view)
  return (
    <div className={`fixed inset-0 ${isMobile ? 'overflow-y-auto' : 'overflow-hidden'} z-50`} style={isMobile ? { minHeight: '100vh' } : undefined}>
      {/* Cyberpunk Grid Background - Show in world map view */}
      {viewMode === 'worldmap' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-black via-black to-black z-[1]"></div>
          <div className="battlefield-background"></div>
        </>
      )}

      {/* Floating Particles */}
      <div className="battlefield-particles">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${3 + Math.random() * 4}s`
            }}
          />
        ))}
      </div>

      {/* Attack Processing Overlay - shown while waiting for API response */}
      {isAttacking && !showBattleAnimation && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-cyan-500"></div>
            <div className="text-cyan-400 text-lg font-bold animate-pulse">
              Preparing Attack...
            </div>
          </div>
        </div>
      )}

      {/* Battle Animation Overlay - DISABLED for V2 battle system */}
      {/* V2 uses BattleVideoOverlay + RoundResultsModal instead */}
      {/* {showBattleAnimation && battleData && (
        <BattleAnimation
          attackers={battleData.attackers}
          defenders={battleData.defenders}
          territory={battleData.territory}
          serverVictory={battleData.serverVictory}
          onComplete={handleBattleComplete}
        />
      )} */}

      {/* NEW V2 TACTICAL BATTLE MODALS */}

      {/* Scouting Modal */}
      {showScoutingModal && (
        <ScoutingModal
          isOpen={showScoutingModal}
          soldiers={battleZone.map(s => ({
            id: s.id,
            name: s.name,
            image: s.image,
            energy: s.energy ?? 100
          }))}
          onScout={handleScout}
          onSkip={handleSkipScouting}
        />
      )}

      {/* Strategy Selection Modal */}
      {showStrategyModal && (
        <StrategySelectionModal
          isOpen={showStrategyModal}
          roundNumber={currentRound}
          maxRounds={maxRounds}
          attackerSoldiers={battleAttackerSoldiers}
          defenderSoldiers={battleDefenderSoldiers}
          scoutIntel={scoutIntel}
          onSelectStrategy={handleStrategySelection}
        />
      )}

      {/* Round Results Modal */}
      {showRoundResultsModal && lastRoundResult && (
        <RoundResultsModal
          isOpen={showRoundResultsModal}
          roundNumber={currentRound}
          maxRounds={maxRounds}
          roundResult={lastRoundResult}
          battleComplete={isBattleComplete}
          onContinue={handleContinueFromResults}
          onRetreat={handleRetreatFromResults}
        />
      )}

      {/* Battle Video Overlay */}
      {selectedTerritory && (
        <BattleVideoOverlay
          isPlaying={showBattleVideo}
          territoryName={selectedTerritory.name}
          onVideoEnd={handleBattleVideoEnd}
        />
      )}

      {/* Energy Restore Modal */}
      {soldierToRestore && (
        <EnergyRestoreModal
          isOpen={showRestoreModal}
          onClose={() => {
            setShowRestoreModal(false);
            setSoldierToRestore(null);
          }}
          onConfirm={handleConfirmRestore}
          currentEnergy={soldierToRestore.energy ?? 0}
          isRestoring={isRestoring}
        />
      )}

      {/* Transition overlay to mask flicker */}
      {isTransitioning && (
        <div className="fixed inset-0 z-[70] bg-black pointer-events-none"
             style={{
               opacity: 0.5,
               transition: 'opacity 200ms ease-in-out'
             }}
        />
      )}

      {/* Conditional Rendering: World Map vs Focused Territory */}
      <div className={`absolute inset-0 z-10 transition-all duration-500 ease-in-out ${
        viewMode === 'worldmap'
          ? isTransitioning
            ? 'scale-[0.2] opacity-0'
            : 'scale-100 opacity-100'
          : 'hidden'
      }`}>
        <WorldMap
          territories={territories}
          userAddress={address}
          onTerritoryClick={handleTerritoryClickFromMap}
        />
      </div>

      {/* Focused Territory View */}
      <div
        className={`absolute inset-0 transition-all duration-500 ease-out bg-black ${
          viewMode === 'focused'
            ? isTransitioning
              ? 'scale-[5] opacity-0'
              : 'scale-100 opacity-100'
            : 'hidden'
        }`}
        style={(() => {
          // Desktop only: Show background image as inline style (for video fallback)
          // Mobile: Don't use inline style, use separate div element below
          if (isMobile || isCDCWallet) {
            return {}; // No inline style on mobile
          }

          const bgImage = selectedTerritory
            ? getTerritoryImage(selectedTerritory.name)
            : '/assets/worldmap/worldmap_static.webp';
          return bgImage
            ? {
                backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url(${bgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {};
        })()}
      >
        {/* Black loading overlay - covers everything including menu bar while video loads */}
        {videoLoading && (
          <div className="fixed inset-0 bg-black z-[9999]" />
        )}

        {/* Territory Background - Static image - Always render, hide on desktop with CSS */}
        <div
          key={`bg-${selectedTerritory?.id || 'worldmap'}`}
          className="md:hidden absolute inset-0 w-full h-full bg-red-900"
          style={{
            backgroundImage: `url(${
              selectedTerritory
                ? getTerritoryImage(selectedTerritory.name)
                : '/assets/worldmap/worldmap_static.webp'
            })`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'brightness(0.7)',
            zIndex: 1
          }}
        />

        {/* Desktop: Show video */}
        {!isMobile && !isCDCWallet && (() => {
          const imageSrc = selectedTerritory
            ? getTerritoryImage(selectedTerritory.name)
            : '/assets/worldmap/worldmap_static.webp';

          // Desktop: Show video
          const videoSrc = selectedTerritory
            ? getTerritoryVideo(selectedTerritory.name)
            : '/assets/worldmap/worldmap_vid.mp4';

          // Check if this video has been played before
          const hasPlayedBefore = selectedTerritory
            ? playedVideoTerritories.has(selectedTerritory.id)
            : hasPlayedWorldmapVideo;

          return videoSrc ? (
            <video
              key={`video-${selectedTerritory?.id || 'worldmap'}-${forceBattleVideoReplay ? 'battle' : 'normal'}`}
              autoPlay={true}
              muted
              playsInline
              preload="metadata"
              className={`${isMobile ? 'fixed' : 'absolute'} inset-0 w-full h-full object-cover`}
              style={{ filter: 'brightness(0.7)' }}
              poster={imageSrc || undefined}
              onLoadedData={(e) => {
                setVideoLoading(false); // Hide black overlay when video is ready
                const video = e.currentTarget as HTMLVideoElement;
                // Slow down video playback by 20% (play at 0.8 speed)
                video.playbackRate = 0.8;

                // If this video has been played before, pause it immediately
                // UNLESS we're forcing a battle replay for immersion
                if (hasPlayedBefore && !forceBattleVideoReplay) {
                  video.pause();
                  video.currentTime = 0; // Reset to start so poster shows
                }
              }}
              onEnded={() => {
                // Mark as played for next time
                if (selectedTerritory) {
                  setPlayedVideoTerritories(prev => new Set(prev).add(selectedTerritory.id));
                } else {
                  setHasPlayedWorldmapVideo(true);
                }

                // Reset battle video replay flag
                if (forceBattleVideoReplay) {
                  setForceBattleVideoReplay(false);
                }
              }}
            >
              <source src={videoSrc} type="video/mp4" />
            </video>
          ) : null;
        })()}
      {/* Demo Mode Banner */}
      {isDemoMode && <DemoBanner onExitDemo={exitDemoMode} />}

      {/* Demo Conversion Modal */}
      <DemoConversionModal
        isOpen={showConversionModal}
        onConnect={exitDemoMode}
        onDismiss={dismissConversionModal}
      />

      <main
        className={`${isMobile ? 'min-h-screen' : 'h-full'} relative z-10 flex flex-col`}
        style={isMobile ? {
          backgroundImage: `url(${
            selectedTerritory
              ? getTerritoryImage(selectedTerritory.name)
              : '/assets/worldmap/worldmap_static.webp'
          })`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : {}}
      >
        {/* LEFT PANEL: Green buttons (game functions) - Floating on left - Full viewport height */}
        <div className="absolute left-4 top-0 bottom-0 z-20 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <div
            className="glass-card rounded-lg hover:bg-green-950/20 transition-all hover:scale-110 group [&>button]:!p-2 [&>button]:!bg-transparent [&>button]:!border-0 [&>button]:!shadow-none [&>button]:hover:!bg-transparent pointer-events-auto"
            title="Wallet"
          >
            <ConnectWalletButton />
          </div>

          <button
            className="glass-card rounded-lg p-2 hover:bg-green-950/20 transition-all hover:scale-110 group flex items-center justify-center pointer-events-auto"
            title="Stake $CA (Blockchain)"
            onClick={() => setShowCAStakingPanel(true)}
          >
            <Coins className="w-5 h-5 text-green-400 group-hover:text-green-300 transition-colors" strokeWidth={2.5} />
          </button>

          <button
            className="glass-card rounded-lg p-2 hover:bg-green-950/20 transition-all hover:scale-110 group flex items-center justify-center pointer-events-auto"
            title="Manage Territory Stakes"
            onClick={() => setShowStakePanel(true)}
          >
            <Settings className="w-5 h-5 text-green-400 group-hover:text-green-300 transition-colors" strokeWidth={2.5} />
          </button>
        </div>

        {/* RIGHT PANEL: Red buttons (navigation), then Blue buttons (soldier actions) - Floating on right - Full viewport height */}
        <div className="absolute right-4 top-0 bottom-0 z-20 flex flex-col items-center justify-center gap-2">
          {/* Red buttons - Navigation/Exit */}
          <button
            className="glass-card rounded-lg p-2 hover:bg-red-950/20 transition-all hover:scale-110 group"
            title="Back to World Map"
            onClick={handleBackToWorldMap}
          >
            <Map className="w-5 h-5 text-red-400 group-hover:text-red-300 transition-colors" strokeWidth={2.5} />
          </button>

          <button
            className="glass-card rounded-lg p-2 hover:bg-red-950/20 transition-all hover:scale-110 group"
            title="Back to Command Center"
            onClick={() => window.location.href = '/command-center'}
          >
            <DoorOpen className="w-5 h-5 text-red-400 group-hover:text-red-300 transition-colors" strokeWidth={2.5} />
          </button>

          {/* Attack Button - Progressive Siege - Show when ready to attack */}
          {battleZone.length > 0 && selectedTerritory && (
            <>
              {/* Progressive Siege Button - Requires 3 soldiers */}
              <button
                className={`cyber-button p-2 rounded-lg transition-transform group ${
                  (isAttacking || battleZone.length < 3) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'
                }`}
                onClick={handleProgressiveSiege}
                disabled={isAttacking || battleZone.length < 3}
                title={battleZone.length < 3 ? 'Progressive Siege (Requires 3 Soldiers)' : 'Progressive Siege'}
              >
                <Target className="w-5 h-5 text-purple-400 group-hover:text-purple-300 transition-colors" strokeWidth={2.5} />
              </button>
            </>
          )}
        </div>

        {/* TOP: Territories Horizontal Strip + Defender Zone */}
        <div className={`${isMobile ? 'flex-none' : 'flex-1'} flex flex-col`}>
          {/* Territories Strip */}
          <div className={`flex-shrink-0 ${isMobile ? 'pt-2 pb-1' : 'pt-6 pb-3'} relative z-30`}>
            <div className="flex gap-3 overflow-x-auto pb-2 pt-1 px-4 scrollbar-hide">
            {loadingTerritories ? (
              <div className="text-gray-500 text-sm py-4">Loading territories...</div>
            ) : territories.length === 0 ? (
              <div className="text-gray-500 text-sm py-4">No territories available</div>
            ) : (
              territories.slice(0, 25).map((territory) => {
                const isSelected = selectedTerritory?.id === territory.id;
                const isClicked = clickedTerritoryId === territory.id;
                const isOwned = territory.owner?.toLowerCase() === address?.toLowerCase();
                const tierEmoji = territory.tier === 'epic' ? '👑' : territory.tier === 'rare' ? '⚔️' : '🛡️';

                // Check for conquest protection cooldown only
                const isOnCooldown = territory.cooldown_until && new Date(territory.cooldown_until) > new Date();
                const isProtected = isOnCooldown;

                return (
                  <div
                    key={territory.id}
                    onClick={(e) => {
                      // Allow clicking on all territories to show info/manage
                      // Toggle clicked state
                      if (isClicked) {
                        setClickedTerritoryId(null);
                      } else {
                        setClickedTerritoryId(territory.id);
                      }
                    }}
                    className={`flex-shrink-0 ${isMobile ? 'w-32 h-20' : 'w-48 h-32'} cursor-pointer transition-all rounded-lg relative ${
                      isOwned
                        ? 'ring-2 ring-green-500/50 shadow-lg shadow-green-500/20'
                        : isClicked
                        ? 'territory-card-selected'
                        : 'territory-card'
                    }`}
                  >
                    {/* Inner container with overflow hidden for image clipping */}
                    <div className="absolute inset-0 rounded-lg overflow-hidden">
                      {/* Background Image - Dynamic per territory */}
                      {(() => {
                        const bgImage = getTerritoryImage(territory.name);
                        return bgImage ? (
                          <div
                            className="absolute inset-0 bg-cover bg-center"
                            style={{ backgroundImage: `url(${bgImage})` }}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-10">
                            {tierEmoji}
                          </div>
                        );
                      })()}

                      {/* Gradient overlay for text readability */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                    </div>

                    <div className={`relative z-10 ${isMobile ? 'p-1' : 'p-3'} h-full flex flex-col`}>
                      {/* Top section - Title and tier */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className={`${isMobile ? 'text-[8px]' : 'text-xs'} text-gray-400`}>{territory.tier.toUpperCase()}</div>
                          {isOwned && (
                            <div className={`${isMobile ? 'text-[7px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5'} font-bold text-green-400 bg-green-900/30 rounded`}>OWNED</div>
                          )}
                        </div>
                        <div className={`font-bold text-white ${isMobile ? 'text-[10px]' : 'text-sm'} truncate`}>{territory.name}</div>
                      </div>

                      {/* Bottom section - Buttons and info */}
                      <div className="mt-auto flex items-end justify-between">
                        {/* Left side - Action button (appears when clicked) */}
                        <div className="flex gap-1">
                          {isClicked && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPanelTerritory(territory);
                                  setShowTerritoryPanel(true);
                                }}
                                className={`glass-card ${isMobile ? 'p-1' : 'p-2.5 md:p-1.5'} rounded hover:bg-cyan-500/20 active:bg-cyan-500/30 transition-all group`}
                                title="Territory Info"
                              >
                                <Info className={`${isMobile ? 'w-3 h-3' : 'w-5 h-5 md:w-3.5 md:h-3.5'} text-cyan-400 group-hover:text-cyan-300 transition-colors`} strokeWidth={2.5} />
                              </button>
                              {!isOwned && !isProtected && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Attack: Select territory and move defender to battlefield
                                    setSelectedTerritory(territory);
                                    setBattleZone([]);
                                  }}
                                  className={`glass-card ${isMobile ? 'p-1' : 'p-2.5 md:p-1.5'} rounded hover:bg-purple-500/20 active:bg-purple-500/30 transition-all group`}
                                  title="Attack"
                                >
                                  <Target className={`${isMobile ? 'w-3 h-3' : 'w-5 h-5 md:w-3.5 md:h-3.5'} text-purple-400 group-hover:text-purple-300 transition-colors`} strokeWidth={2.5} />
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Right side - Status info */}
                        <div className="flex items-center gap-1.5">
                          {isProtected ? (
                            <>
                              {/* Cooldown protection icon */}
                              <div className="bg-orange-500 rounded-full p-1 shadow-lg">
                                <Clock className="w-3 h-3 text-white" />
                              </div>
                              {/* Time remaining */}
                              <div className="text-xs font-bold text-white">
                                {territory.cooldown_until
                                  ? getTimeRemaining(territory.cooldown_until)
                                  : ''}
                              </div>
                            </>
                          ) : !isMobile ? (
                            <div className="flex flex-col text-xs text-right">
                              <span className="text-gray-500">DEF: <span className="cyan-glow font-bold">+{territory.defenseBonus}%</span></span>
                              <span className="text-gray-500">RWD: <span className="purple-glow font-bold">{territory.baseRewardPerHour}/h</span></span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>

          {/* Defender Battlefield Zone - Continues red background */}
          <div className={`${isMobile ? 'flex-none h-[35vh]' : 'flex-1'} flex items-center justify-center ${isMobile ? 'px-2' : 'px-4'}`}>
            <div
              className={`w-full max-w-5xl transition-all ${
                draggedSoldier ? 'scale-105' : ''
              }`}
            >
              {selectedTerritory ? (
                <div className="space-y-0">
                  {/* Enemy Defenders Display */}
                  <div className={isMobile ? 'p-2' : 'p-6'}>
                  <div className={`text-xs text-gray-400 ${isMobile ? 'mb-1' : 'mb-3'} text-center`}>
                    DEFENDERS
                    {selectedTerritory.owner && !isMobile && (
                      <span className="ml-2 text-gray-500">
                        ({selectedTerritory.owner.slice(0, 6)}...{selectedTerritory.owner.slice(-4)})
                      </span>
                    )}
                  </div>
                  <div className={`flex justify-center ${isMobile ? 'gap-1 overflow-x-auto' : 'gap-3'}`}>
                    {selectedTerritory.soldiers && selectedTerritory.soldiers.length > 0 ? (
                      // Show all defending soldiers in the squad
                      selectedTerritory.soldiers.map((soldier: Soldier) => (
                        <div key={soldier.id} className={`${isMobile ? 'w-16 h-20' : 'w-20 h-28'} relative soldier-card rounded-lg overflow-hidden flex-shrink-0`}>
                          {soldier.imageUrl ? (
                            <div className="absolute inset-0">
                              <OptimizedImage
                                src={soldier.imageUrl}
                                alt={soldier.name}
                                width={112}
                                height={144}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-red-900/20 to-red-900/40">
                              <div className="text-5xl">🤖</div>
                            </div>
                          )}
                          <div className="relative z-10 h-full flex flex-col justify-end p-2">
                            <div className="text-center">
                              <div className="text-[10px] font-bold text-white truncate mb-1">{soldier.name}</div>
                              <div className="text-[9px] text-gray-400 mb-1">{soldier.rank}</div>
                              <div className="text-xs text-red-400 font-bold mb-1">{soldier.power || '???'}</div>

                              {/* Energy Bar */}
                              <div className="mb-1">
                                <EnergyBar energy={soldier.energy ?? 100} size="small" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      // Show AI defenders for unoccupied territories
                      Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className={`${isMobile ? 'w-16 h-20' : 'w-20 h-28'} relative soldier-card rounded-lg overflow-hidden flex-shrink-0`}>
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-red-900/20 to-red-900/40">
                            <div className="text-5xl">🤖</div>
                          </div>
                          <div className="relative z-10 h-full flex flex-col justify-end p-2">
                            <div className="text-center">
                              <div className="text-[10px] font-bold text-white truncate mb-1">AI Guardian {String.fromCharCode(65 + idx)}</div>
                              <div className="text-xs text-red-400 font-bold mb-1">{100 + idx * 50}</div>

                              {/* Energy Bar - AI always at full energy */}
                              <div className="mb-1">
                                <EnergyBar energy={100} size="small" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        </div>

        {/* BOTTOM: Attack Force Zone + Battalion */}
        <div className={`${isMobile ? 'flex-none h-[55vh]' : 'flex-1'} flex flex-col relative`}>
          {/* Attack Force Battlefield Zone - Centered */}
          <div className={`${isMobile ? 'flex-none h-[40%]' : 'flex-1'} flex items-center justify-center ${isMobile ? 'px-2' : 'px-20'}`}>
            <div
              data-drop-zone="battle"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropToBattleZone}
              className={`w-full max-w-3xl transition-all ${
                draggedSoldier ? 'scale-105' : ''
              }`}
            >
              {selectedTerritory ? (
                <div className={`rounded-b-lg ${isMobile ? 'p-2' : 'p-6'}`}>
                  {battleZone.length === 0 ? (
                    <div className={`text-center ${isMobile ? 'py-3' : 'py-8'}`}>
                      <p className="text-gray-500 text-sm">{isMobile ? 'Tap soldiers below to attack' : 'Drag soldiers here to attack'}</p>
                    </div>
                  ) : (
                    <div>
                      <div className={`text-xs text-gray-400 ${isMobile ? 'mb-1' : 'mb-3'} text-center`}>YOUR ATTACK FORCE</div>
                      <div className={`flex flex-wrap justify-center ${isMobile ? 'gap-1' : 'gap-3'}`}>
                        {battleZone.map((soldier) => (
                          <div key={soldier.id} className={`${isMobile ? 'w-16 h-20' : 'w-20 h-28'} relative soldier-card rounded-lg overflow-hidden deployed-glow`}>
                            <button
                              onClick={() => handleRemoveFromBattleZone(soldier.id)}
                              className="absolute top-1 right-1 w-5 h-5 bg-red-600/80 hover:bg-red-600 rounded-full text-white text-xs flex items-center justify-center z-20"
                            >
                              ✕
                            </button>
                            <div className="absolute inset-0">
                              {soldier.image ? (
                                <OptimizedImage
                                  src={soldier.image}
                                  alt={soldier.name}
                                  width={112}
                                  height={144}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-slate-800 flex items-center justify-center text-4xl">🎖️</div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
                            </div>
                            <div className="relative z-10 h-full flex flex-col justify-end p-2">
                              <div className="text-center">
                                <div className="text-[10px] font-bold text-white truncate mb-1">{soldier.name}</div>
                                <div className="text-xs cyan-glow font-bold mb-1">{soldier.power}</div>

                                {/* Energy Bar */}
                                <div className="mb-1">
                                  <EnergyBar energy={soldier.energy ?? 100} size="small" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Battalion Strip */}
          <div className={`${isMobile ? 'flex-1 h-[60%] overflow-y-auto' : 'flex-shrink-0'} px-4 ${isMobile ? 'pb-2 pt-1' : 'pb-4 pt-3'}`}>
            <div className={isMobile ? 'p-1' : 'p-3'}>

            {loading ? (
              <div className="flex justify-center py-4">
                <div className="cyber-spinner h-8 w-8"></div>
              </div>
            ) : soldiers.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-500 text-sm mb-3">No soldiers available</p>
                <button
                  className="cyber-button px-4 py-2 rounded text-sm"
                  onClick={() => window.location.href = '/create-soldier'}
                >
                  Recruit Soldiers
                </button>
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                {soldiers.map((soldier) => {
                  const isDeployed = battleZone.find(s => s.id === soldier.id);
                  const isDefending = defendingSoldierIds.has(soldier.id);
                  const isClicked = clickedSoldierId === soldier.id;
                  const hasLowEnergy = (soldier.energy ?? 100) < 20; // Battle requires min 20 energy
                  const isTraining = soldier.isTraining || false; // Soldier is currently training
                  const isUnavailable = isDeployed || isDefending || hasLowEnergy || isTraining;

                  return (
                    <div
                      key={soldier.id}
                      draggable={!isMobile && !isDeployed && !isDefending && !isTraining && !isClicked}
                      onDragStart={() => !isDeployed && !isDefending && !isTraining && !isClicked && handleDragStart(soldier)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => {
                        if (isMobile && !isDeployed && !isDefending && !isTraining) {
                          // Mobile: Prevent scrolling when touching soldier
                          e.stopPropagation();
                        }
                      }}
                      onTouchMove={(e) => {
                        if (isMobile && !isDeployed && !isDefending && !isTraining) {
                          e.stopPropagation();
                        }
                        handleTouchMove(e);
                      }}
                      onTouchEnd={(e) => {
                        if (isMobile && !isDeployed && !isDefending && !isTraining) {
                          e.stopPropagation();
                        }
                        handleTouchEnd(e);
                      }}
                      onClick={() => {
                        if (isMobile && !isDeployed && !isDefending && !isTraining) {
                          // Mobile: Tap to add to battle zone
                          if (!battleZone.find(s => s.id === soldier.id)) {
                            setBattleZone([...battleZone, soldier]);
                          }
                        } else if (!isMobile) {
                          // Desktop: Toggle clicked state if not touch dragging
                          if (!touchDragging) {
                            if (isClicked) {
                              setClickedSoldierId(null);
                            } else {
                              setClickedSoldierId(soldier.id);
                            }
                          }
                        }
                      }}
                      className={`flex-shrink-0 ${isMobile ? 'w-24 h-32' : 'w-28 h-36'} rounded-lg ${
                        isClicked ? 'border-t-4 border-cyan-500' : ''
                      } ${
                        isDeployed
                          ? 'opacity-50 cursor-not-allowed'
                          : isDefending
                          ? 'opacity-70 cursor-pointer hover:scale-105'
                          : isClicked
                          ? 'cursor-pointer ring-2 ring-cyan-500'
                          : 'cursor-grab active:cursor-grabbing hover:scale-105'
                      } transition-all`}
                      style={isMobile && !isUnavailable ? { touchAction: 'none' } : {}}
                    >
                      <div className="soldier-card rounded-lg overflow-hidden h-full relative">
                        {/* NFT Background */}
                        <div className="absolute inset-0">
                          {soldier.imageUrl || soldier.image ? (
                            <OptimizedImage
                              src={soldier.imageUrl || soldier.image}
                              alt={soldier.name}
                              width={128}
                              height={160}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-800 flex items-center justify-center text-5xl">🎖️</div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
                        </div>

                        {/* Info */}
                        <div className={`relative z-10 h-full flex flex-col justify-end ${isMobile ? 'p-1' : 'p-2'}`}>
                          <div className="text-center">
                            <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} font-bold text-white truncate ${isMobile ? 'mb-0' : 'mb-1'}`}>{soldier.name}</div>
                            {!isMobile && <div className="text-xs text-gray-400 mb-1">{formatRank(soldier.rank)}</div>}
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm'} cyan-glow font-bold ${isMobile ? 'mb-0' : 'mb-1'}`}>{soldier.power}</div>

                            {/* Energy Bar */}
                            <div className="mb-1">
                              <EnergyBar energy={soldier.energy ?? 100} size="small" />
                            </div>

                            {isDeployed && (
                              <div className={`mt-1 text-[${isMobile ? '8px' : '10px'}] purple-glow`}>DEPLOYED</div>
                            )}
                            {isDefending && (
                              <div className={`mt-1 text-[${isMobile ? '8px' : '10px'}] text-green-400 font-bold`}>DEFENDING</div>
                            )}
                            {isTraining && !isDefending && (
                              <div className={`mt-1 text-[${isMobile ? '8px' : '10px'}] text-blue-400 font-bold`}>TRAINING</div>
                            )}
                            {hasLowEnergy && !isDefending && !isTraining && (
                              <div className={`mt-1 text-[${isMobile ? '8px' : '10px'}] text-orange-400 font-bold`}>LOW ENERGY</div>
                            )}

                            {/* Recharge button for soldiers with <100 energy - hide on mobile */}
                            {!isMobile && !isDeployed && !isDefending && soldier.energy && soldier.energy < 100 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenRestoreModal(soldier);
                                }}
                                className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                                         bg-[rgba(0,255,204,0.15)] hover:bg-[rgba(0,255,204,0.25)]
                                         text-[#00ffcc] transition-all flex items-center justify-center gap-1 mx-auto"
                                title="Restore Energy"
                              >
                                <Zap className="w-3 h-3" />
                                Recharge
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      </main>
      </div>

      {/* Territory Details Panel */}
      {panelTerritory && (
        <TerritoryDetailsPanel
          isOpen={showTerritoryPanel}
          territory={panelTerritory}
          onClose={() => {
            setShowTerritoryPanel(false);
            setPanelTerritory(null);
          }}
          currentWallet={address}
          onSquadManage={(territoryId) => {
            setSquadTerritoryId(territoryId);
            setSquadTerritoryName(panelTerritory.name);
            setShowSquadPanel(true);
            setShowTerritoryPanel(false);
          }}
        />
      )}

      {/* Squad Management Panel */}
      {squadTerritoryId && (
        <SquadManagementPanel
          isOpen={showSquadPanel}
          territoryId={squadTerritoryId}
          territoryName={squadTerritoryName}
          onClose={() => {
            setShowSquadPanel(false);
            setSquadTerritoryId(null);
            setSquadTerritoryName('');
          }}
          onBack={() => {
            // Go back to territory details panel
            setShowSquadPanel(false);
            setShowTerritoryPanel(true);
          }}
          currentWallet={address || ''}
          availableSoldiers={soldiers.map(s => ({
            id: s.id,
            name: s.name,
            rank: s.rank || '',
            power: s.power,
            image: s.image,
            imageUrl: getSoldierImageUrl(s)
          }))}
        />
      )}

      {/* Stake Management Panel */}
      <StakeManagementPanel
        isOpen={showStakePanel}
        onClose={() => setShowStakePanel(false)}
        territories={territories.filter(t => t.owner?.toLowerCase() === address?.toLowerCase())}
        walletAddress={address || ''}
        totalCABalance={walletCABalance}
        totalStakedAmount={stakedCABalance}
        onStakeUpdate={() => {
          fetchTerritories();
          fetchCABalance();
        }}
      />

      {/* CA Staking Panel (Blockchain) */}
      <PanelContainer
        isOpen={showCAStakingPanel}
        onClose={() => setShowCAStakingPanel(false)}
        side="right"
        width="wide"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-black to-yellow-950/30 border-b border-gray-800 p-6">
          <div className="flex items-center gap-3">
            <Coins className="w-5 h-5 text-yellow-400" />
            <h2 className="text-xl font-bold text-white uppercase tracking-wide">Stake $CA (Blockchain)</h2>
          </div>
          <div className="text-sm text-gray-400 mt-1">Stake or unstake your CA tokens on the blockchain</div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <CAStakingPanel />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-black">
          <button
            onClick={() => setShowCAStakingPanel(false)}
            className="w-full cyber-button px-4 py-3 rounded font-bold uppercase tracking-wider text-sm hover:bg-cyan-500/10"
          >
            Close
          </button>
        </div>
      </PanelContainer>

      {/* Floating Dragged Soldier Card - Mobile Visual Feedback */}
      {touchDragging && draggedSoldier && touchCurrentPos && (
        <div
          className="fixed pointer-events-none z-[9999]"
          style={{
            left: touchCurrentPos.x,
            top: touchCurrentPos.y,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="glass-card p-3 rounded-lg border-2 border-cyan-500 shadow-2xl opacity-90 scale-110 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-16 h-20 rounded overflow-hidden flex-shrink-0">
                <OptimizedImage
                  src={draggedSoldier.image || draggedSoldier.imageUrl || ''}
                  alt={draggedSoldier.name}
                  width={64}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm truncate">{draggedSoldier.name}</div>
                <div className="text-gray-400 text-xs">{draggedSoldier.rank}</div>
                <div className="flex items-center gap-1 mt-1">
                  <Zap className="w-3 h-3 text-yellow-400" />
                  <span className="text-yellow-400 font-bold text-xs">{draggedSoldier.power || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progressive Siege Modal */}
      {showProgressiveSiege && selectedTerritory && (
        <UnifiedSiegeScreenV2
          territoryId={selectedTerritory.id}
          territoryName={selectedTerritory.name}
          territoryImage={getTerritoryImage(selectedTerritory.name) || undefined}
          preSelectedSoldierIds={battleZone.map(s => s.id)}
          onComplete={handleProgressiveSiegeComplete}
          onCancel={() => setShowProgressiveSiege(false)}
        />
      )}
    </div>
  );
}