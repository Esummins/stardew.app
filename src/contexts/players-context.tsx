import useSWR from "swr";

import {
  useMemo,
  useState,
  useEffect,
  ReactNode,
  useContext,
  useCallback,
  createContext,
} from "react";

import type { CookingRet } from "@/lib/parsers/cooking";
import type { CraftingRet } from "@/lib/parsers/crafting";
import type { FishRet } from "@/lib/parsers/fishing";
import type { GeneralRet } from "@/lib/parsers/general";
import type { MonstersRet } from "@/lib/parsers/monsters";
import type { MuseumRet } from "@/lib/parsers/museum";
import type { NotesRet } from "@/lib/parsers/notes";
import type { PerfectionRet } from "@/lib/parsers/perfection";
import type { ScrapsRet } from "@/lib/parsers/scraps";
import type { ShippingRet } from "@/lib/parsers/shipping";
import type { SocialRet } from "@/lib/parsers/social";
import type { WalnutRet } from "@/lib/parsers/walnuts";
import type { PowersRet } from "@/lib/parsers/powers";
import { BundleWithStatus } from "@/types/bundles";
import { DeepPartial } from "react-hook-form";

export interface PlayerType {
  _id: string;
  general?: GeneralRet;
  bundles?: BundleWithStatus[];
  fishing?: FishRet;
  cooking?: CookingRet;
  crafting?: CraftingRet;
  shipping?: ShippingRet;
  museum?: MuseumRet;
  social?: SocialRet;
  monsters?: MonstersRet;
  walnuts?: WalnutRet;
  notes?: NotesRet;
  scraps?: ScrapsRet;
  perfection?: PerfectionRet;
  powers?: PowersRet;
}

interface PlayersContextProps {
  players?: PlayerType[];
  uploadPlayers: (players: PlayerType[]) => Promise<Response>;
  patchPlayer: (patch: DeepPartial<PlayerType>) => Promise<void>;
  activePlayer?: PlayerType;
  setActivePlayer: (player?: PlayerType) => void;
}

export const PlayersContext = createContext<PlayersContextProps>({
  // @ts-expect-error
  uploadPlayers: () => {},
  patchPlayer: () => Promise.resolve(),
  setActivePlayer: () => {},
});

/**
 * Normalizes a patch object against a target object to ensure all nested objects and arrays are merged correctly.
 * This function converts any array keys into dereferenced arrays because json_merge_patch does not recurse into arrays.
 * @param patch The changes to apply to the target.
 * @param target The original object that the patch will modify.
 * @param inArray A flag indicating if the current process is within an array.
 * @returns A new object representing the merged state of patch and target.
 */
function normalizePatch(
  patch: any,
  target: any,
  inArray: boolean = false,
): any {
  // Return the patch immediately if there's no target to merge with.
  if (!target) {
    return patch;
  }

  // Return the patch directly if it's not an object or array.
  if (typeof patch !== "object" || patch === null) {
    return patch;
  }

  // Initialize a new patch that copies the original to avoid mutations.
  const newPatch = Array.isArray(patch) ? [...patch] : { ...patch };

  // Iterate over all properties in the patch object.
  for (const key in patch) {
    if (Array.isArray(target[key])) {
      // Handle array merging by first copying the existing target array.
      newPatch[key] = [...target[key]];

      // Recursively normalize each element of the array.
      patch[key].forEach((item: any, index: number) => {
        newPatch[key][index] = normalizePatch(item, target[key][index], true);
      });
    } else {
      // Recursively normalize nested objects.
      newPatch[key] = normalizePatch(patch[key], target[key], inArray);
    }
  }

  // If we are in an array, ensure that missing fields in the patch are filled from the target.
  if (inArray) {
    Object.keys(target).forEach((field) => {
      if (!(field in newPatch)) {
        newPatch[field] = target[field];
      }
    });
  }

  return newPatch;
}

/**
 * Recursively merges properties from source objects into a target object, creating a new object.
 * This function does not mutate the original target but returns a new object.
 * It only updates references within the new object when there are actual changes to content or children,
 * regardless of the depth of those changes. Arrays are copied rather than merged, and nested objects
 * are recursively populated. This function can handle an arbitrary number of source objects.
 * @param target The initial object to merge properties into.
 * @param sources One or more objects from which properties will be sourced.
 * @returns The target object merged with properties from all source objects.
 */
export function mergeDeep(target: any, ...sources: any[]): any {
  const isObject = (item: any) => item && typeof item === "object";

  if (!sources.length) return target;
  const source = sources.shift();
  const newTarget = Array.isArray(target) ? [...target] : { ...target };

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) newTarget[key] = {};
        newTarget[key] = mergeDeep(newTarget[key], source[key]);
      } else {
        newTarget[key] = source[key];
      }
    }
  }
  return mergeDeep(newTarget, ...sources);
}

export const PlayersProvider = ({ children }: { children: ReactNode }) => {
  const api = useSWR<PlayerType[]>("/api/saves", (...args) =>
    // @ts-expect-error
    fetch(...args).then((res) => res.json()),
  );
  const [activePlayerId, setActivePlayerId] = useState<string>();
  const players = useMemo(() => api.data ?? [], [api.data]);
  const activePlayer = useMemo(
    () => players.find((p) => p._id === activePlayerId),
    [players, activePlayerId],
  );

  useEffect(() => {
    if (!activePlayerId && players.length > 0) {
      setActivePlayerId(players[0]._id);
    }
  }, [activePlayerId, players]);

  // TODO: switch patchplayer use immutability-helper instead of custom merge logic
  const patchPlayer = useCallback(
    async (patch: DeepPartial<PlayerType>) => {
      if (!activePlayer) return;
      const patchPlayers = (players: PlayerType[] | undefined) =>
        (players ?? []).map((p) => {
          if (p._id === activePlayer._id) {
            return mergeDeep(p, patch);
          }
          return p;
        });
      await api.mutate(
        async (currentPlayers: PlayerType[] | undefined) => {
          const normalizedPatch = normalizePatch(patch, activePlayer);
          // console.log("Normalizing patch:");
          // console.dir(normalizedPatch);
          await fetch(`/api/saves/${activePlayer._id}`, {
            method: "PATCH",
            body: JSON.stringify(normalizedPatch),
          });
          return patchPlayers(currentPlayers);
        },
        { optimisticData: patchPlayers },
      );
    },
    [api],
  );

  const uploadPlayers = useCallback(
    async (players: PlayerType[]) => {
      let res = await fetch("/api/saves", {
        method: "POST",
        body: JSON.stringify(players),
      });
      await api.mutate(players);
      setActivePlayerId(players[0]._id);
      return res;
    },
    [api, setActivePlayerId],
  );

  const setActivePlayer = useCallback((player?: PlayerType) => {
    if (!player) {
      setActivePlayerId(undefined);
      return;
    }
    setActivePlayerId(player._id);
  }, []);

  return (
    <PlayersContext.Provider
      value={{
        players,
        uploadPlayers,
        patchPlayer,
        activePlayer,
        setActivePlayer,
      }}
    >
      {children}
    </PlayersContext.Provider>
  );
};

export const usePlayers = () => {
  return useContext(PlayersContext);
};
