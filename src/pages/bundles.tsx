import Head from "next/head";

import achievements from "@/data/achievements.json";
import bundlesData from "@/data/bundles.json";

import {
  Bundle,
  BundleWithStatus,
  BundleItem,
  BundleItemWithLocation,
  CommunityCenterRoomName,
  CommunityCenterRoom,
  isRandomizer,
  Randomizer,
  CommunityCenter,
  BundleWithStatusAndOptions,
  BundleWithItemOptions,
  BundleItemWithOptions,
} from "@/types/bundles";

import { PlayerType, usePlayers } from "@/contexts/players-context";
import { usePreferences } from "@/contexts/preferences-context";

import { AchievementCard } from "@/components/cards/achievement-card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { BooleanCard } from "@/components/cards/boolean-card";
import { use, useEffect, useState } from "react";
import { UnblurDialog } from "@/components/dialogs/unblur-dialog";
import { BundleSheet } from "@/components/sheets/bundle_sheet";
import { get } from "http";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenu,
  ContextMenuRadioItem,
  ContextMenuRadioGroup,
} from "@/components/ui/context-menu";
import next from "next";

type BundleAccordionProps = {
  bundleWithStatus: BundleWithStatus;
  children: JSX.Element | JSX.Element[];
  alternateOptions?: Bundle[];
  onChangeBundle?: (bundle: Bundle, bundleWithStatus: BundleWithStatus) => void;
};

type AccordionSectionProps = {
  title: string;
  children: JSX.Element | JSX.Element[];
};

const CommunityCenterRooms: CommunityCenterRoomName[] = [
  "Pantry",
  "Crafts Room",
  "Fish Tank",
  "Boiler Room",
  "Vault",
  "Bulletin Board",
  "Abandoned Joja Mart",
];

function AccordionSection(props: AccordionSectionProps): JSX.Element {
  return (
    <Accordion type="single" collapsible defaultValue="item-1" asChild>
      <section className="space-y-3">
        <AccordionItem value="item-1">
          <AccordionTrigger className="ml-1 pt-0 text-xl font-semibold text-gray-900 dark:text-white">
            {props.title}
          </AccordionTrigger>
          <AccordionContent asChild>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {props.children}
            </div>
          </AccordionContent>
        </AccordionItem>
      </section>
    </Accordion>
  );
}

function BundleAccordion(props: BundleAccordionProps): JSX.Element {
  return (
    <Accordion type="single" collapsible defaultValue="item-1" asChild>
      <section className="space-y-3">
        <AccordionItem value="item-1">
          <ContextMenu>
            <ContextMenuTrigger>
              <AccordionTrigger className="ml-1 pt-0 text-xl font-semibold text-gray-900 dark:text-white">
                <div className="justify-left flex">
                  {props.bundleWithStatus.bundle.localizedName + " Bundle"}
                </div>
              </AccordionTrigger>
            </ContextMenuTrigger>

            <ContextMenuContent className="w-48">
              {props.alternateOptions && (
                <ContextMenuRadioGroup
                  value={props.bundleWithStatus.bundle.name}
                  onValueChange={(v) => {
                    let selectedBundle = props.alternateOptions?.find(
                      (bundle) => bundle.name === v,
                    );
                    if (props.onChangeBundle && selectedBundle) {
                      props.onChangeBundle(
                        selectedBundle,
                        props.bundleWithStatus,
                      );
                    }
                  }}
                >
                  {props.alternateOptions.map((option) => {
                    return (
                      <ContextMenuRadioItem value={option.name}>
                        {option.localizedName} Bundle
                      </ContextMenuRadioItem>
                    );
                  })}
                </ContextMenuRadioGroup>
              )}
            </ContextMenuContent>
          </ContextMenu>
          <AccordionContent asChild>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {props.children}
            </div>
          </AccordionContent>
        </AccordionItem>
      </section>
    </Accordion>
  );
}

function BundleCompleted(bundleWithStatus: BundleWithStatus): boolean {
  if (bundleWithStatus.bundle.itemsRequired === -1) {
    // Gold bundles are encoded in the save file as requiring -1 items
    return bundleWithStatus.bundleStatus[0];
  }
  return bundleWithStatus.bundleStatus
    .slice(0, bundleWithStatus.bundle.itemsRequired)
    .every((status) => status);
}

function ResolveBundleRandomizer(bundleRandomizer: Randomizer): Bundle[] {
  let selectionCount = bundleRandomizer.selectionCount;
  let relevantBundles = bundleRandomizer.options.slice(
    0,
    selectionCount,
  ) as Bundle[];
  let resolvedBundles: Bundle[] = [];
  relevantBundles.forEach((bundle) => {
    resolvedBundles.push(ResolveItemRandomizers(bundle));
  });
  return resolvedBundles;
}

function ResolveItemRandomizers(bundle: Bundle): Bundle {
  let finishedBundle = {
    ...bundle,
  };
  if (isRandomizer(bundle.items)) {
    let selectionCount = bundle.items.selectionCount;
    let relevantItems = bundle.items.options.slice(
      0,
      selectionCount,
    ) as BundleItem[];
    finishedBundle.items = relevantItems;
  } else {
    let items: BundleItem[] = [];
    bundle.items.forEach((item) => {
      if (isRandomizer(item)) {
        let selectionCount = item.selectionCount;
        let relevantItems = item.options.slice(
          0,
          selectionCount,
        ) as BundleItem[];
        items = items.concat(relevantItems);
      } else {
        items.push(item);
      }
    });
    finishedBundle.items = items;
  }
  return finishedBundle;
}

function AttachRandomizerData(
  allBundlesWithStatuses: BundleWithStatus[],
): BundleWithStatus[] {
  // Find and attach alternate bundle options
  CommunityCenterRooms.forEach((roomName) => {
    let roomBundleSpecification = (bundlesData as CommunityCenter)[roomName];
    roomBundleSpecification.forEach((bundleSpecification) => {
      if (isRandomizer(bundleSpecification)) {
        let optionNames = bundleSpecification.options.map(
          (bundle) => (bundle as Bundle).name,
        );
        let currentlySelectedBundles = allBundlesWithStatuses.filter(
          (bundleWithStatus) =>
            optionNames.includes(bundleWithStatus.bundle.name),
        );
        currentlySelectedBundles.forEach((bundleWithStatus) => {
          let options = bundleSpecification.options.map((bundle) => {
            let resolvedBundle = ResolveItemRandomizers(bundle as Bundle);
            return {
              ...resolvedBundle,
              localizedName: resolvedBundle.name,
            };
          });
          (bundleWithStatus as BundleWithStatusAndOptions)["options"] = options;
        });
      }
    });
  });

  // Find and attach alternate item options to Bundles
  allBundlesWithStatuses.forEach((bundleWithStatus) => {
    let bundle = bundleWithStatus.bundle;
    if (!bundle.areaName) {
      return;
    }
    let items = bundle.items as BundleItem[];
    // Find bundle spec
    const bundleRoomSpec = bundlesData[bundle.areaName];
    const possibleBundles: Bundle[] = [];
    bundleRoomSpec.forEach((bundleSpec) => {
      if (isRandomizer(bundleSpec)) {
        possibleBundles.push(...(bundleSpec.options as Bundle[]));
      } else {
        possibleBundles.push(bundleSpec as Bundle);
      }
    });

    const bundleSpec = possibleBundles.find((b) => b.name === bundle.name);
    if (!bundleSpec) {
      return;
    }
    let index = -1;
    // Iterate over items in spec to find randomizers
    bundleSpec.items.forEach((itemSpec) => {
      index = index + 1;
      if (isRandomizer(itemSpec)) {
        let itemRandomizer = itemSpec;
        let itemOptions = itemRandomizer.options as BundleItem[];
        let selectionCount = itemRandomizer.selectionCount;

        let currentIndex = index;
        while (currentIndex < index + selectionCount) {
          // Attach (randomizer options - used options) to relevant items
          let alternateOptions = itemOptions.filter((newItem) => {
            return !items
              .map((item) => {
                return item.itemID;
              })
              .includes(newItem.itemID);
          });
          (bundle.items[currentIndex] as BundleItemWithOptions).options =
            alternateOptions;
          currentIndex = currentIndex + 1;
        }
        index = currentIndex - 1;
      }
    });
  });

  return allBundlesWithStatuses;
}

function GetActiveBundles(
  activePlayer: PlayerType | undefined,
): BundleWithStatus[] {
  let activeBundles: BundleWithStatus[] = [];
  if (activePlayer && activePlayer.bundles) {
    activeBundles = activePlayer.bundles;
  } else {
    let allBundlesWithStatuses: BundleWithStatus[] = [];
    CommunityCenterRooms.forEach((roomName) => {
      let roomBundleSpecification = bundlesData[roomName];
      let resolvedBundles: Bundle[] = [];
      roomBundleSpecification.forEach((bundleSpecification) => {
        if (isRandomizer(bundleSpecification)) {
          resolvedBundles.push(...ResolveBundleRandomizer(bundleSpecification));
        } else {
          resolvedBundles.push(
            ResolveItemRandomizers(bundleSpecification as Bundle),
          );
        }
      });
      let roomBundles = resolvedBundles.map((bundle) => {
        let bundleStatus: boolean[] = [];
        bundle.items.forEach(() => {
          bundleStatus.push(false);
        });
        bundle.areaName = roomName;
        bundle.localizedName = bundle.name;
        return {
          bundle,
          bundleStatus,
        };
      });
      allBundlesWithStatuses = allBundlesWithStatuses.concat(roomBundles);
      // console.log(allBundlesWithStatuses);
    });
    activeBundles = allBundlesWithStatuses;
  }
  AttachRandomizerData(activeBundles);
  return activeBundles;
}

export default function Bundles() {
  // unblur dialog
  const [showPrompt, setPromptOpen] = useState(false);
  const { show, toggleShow } = usePreferences();

  let [open, setIsOpen] = useState(false);
  let [object, setObject] = useState<BundleItemWithLocation | null>(null);
  let [bundles, setBundles] = useState<BundleWithStatus[]>([]);
  const { activePlayer } = usePlayers();

  function SwapBundle(
    newBundle: Bundle,
    oldBundleWithStatus: BundleWithStatus,
  ) {
    let newBundles = [...bundles];
    let index = newBundles.findIndex(
      (b) => b.bundle.name === oldBundleWithStatus.bundle.name,
    );
    newBundle.areaName = oldBundleWithStatus.bundle.areaName;
    let newBundleWithStatus = {
      bundle: newBundle,
      bundleStatus: new Array(newBundle.items.length).fill(false),
    };
    newBundles[index] = newBundleWithStatus;
    setBundles(AttachRandomizerData(newBundles));
  }

  useEffect(() => {
    setBundles(GetActiveBundles(activePlayer));
  }, [activePlayer]);

  const getAchievementProgress = (name: string) => {
    if (bundles.length < 1) {
      // Guard for this function being called prior to bundles being loaded
      return { completed: false, additionalDescription: "" };
    }

    let completed = false;
    let additionalDescription = "";

    if (name === "Local Legend") {
      let completedCount = bundles.reduce((acc, curBundelRet) => {
        if (BundleCompleted(curBundelRet)) return acc + 1;
        return acc;
      }, 0);
      completed = completedCount >= 31;
      if (!completed) {
        additionalDescription = ` - ${
          31 - completedCount
        } more bundles to complete the community center`;
      }
    }

    return { completed, additionalDescription };
  };

  return (
    <>
      <Head>
        <title>stardew.app | Bundles</title>
        <meta name="title" content="Stardew Valley Bundles | stardew.app" />
        <meta
          name="description"
          content="Track and manage items needed for bundles in Stardew Valley's Community Center. Keep tabs on the items you've collected and monitor your progress towards completing the bundles. Discover what items are still needed to fulfill each bundle requirement and restore the Community Center to its former glory."
        />
        <meta
          name="og:description"
          content="Track and manage items needed for bundles in Stardew Valley's Community Center. Keep tabs on the items you've collected and monitor your progress towards completing the bundles. Discover what items are still needed to fulfill each bundle requirement and restore the Community Center to its former glory."
        />
        <meta
          name="twitter:description"
          content="Track and manage items needed for bundles in Stardew Valley's Community Center. Keep tabs on the items you've collected and monitor your progress towards completing the bundles. Discover what items are still needed to fulfill each bundle requirement and restore the Community Center to its former glory."
        />
        <meta
          name="keywords"
          content="stardew valley bundle tracker, stardew valley community center bundles, stardew valley bundle items, stardew valley bundle progress, stardew valley community center restoration, stardew valley gameplay tracker, stardew valley, stardew, bundle tracker, stardew valley, stardew, stardew checkup, stardew bundles, stardew 100% completion, stardew perfection tracker, stardew, valley"
        />
      </Head>
      <main
        className={`flex min-h-screen items-center justify-center border-neutral-200 px-5 pb-8 pt-2 dark:border-neutral-800 md:border-l md:px-8`}
      >
        <div className="mx-auto mt-4 w-full space-y-4">
          <h1 className="ml-1 text-2xl font-semibold text-gray-900 dark:text-white">
            Bundle Tracker
          </h1>
          <AccordionSection title="Achievements" key="Achievements">
            {Object.values(achievements)
              .filter((a) => a.description.includes("Community Center"))
              .map((achievement) => {
                const { completed, additionalDescription } =
                  getAchievementProgress(achievement.name);

                return (
                  <AchievementCard
                    key={achievement.id}
                    achievement={achievement}
                    completed={completed}
                    additionalDescription={additionalDescription}
                  />
                );
              })}
          </AccordionSection>
          {CommunityCenterRooms.map((roomName: CommunityCenterRoomName) => {
            let roomBundles: BundleWithStatus[] = [];
            if (activePlayer && activePlayer.bundles) {
              roomBundles = activePlayer.bundles.filter(
                (bundleWithStatus) =>
                  bundleWithStatus.bundle.areaName === roomName,
              );
            } else {
              roomBundles = bundles.filter(
                (bundleWithStatus) =>
                  bundleWithStatus.bundle.areaName === roomName,
              );
            }
            return (
              <AccordionSection key={roomName} title={roomName}>
                {roomBundles.map((bundleWithStatus: BundleWithStatus) => {
                  return (
                    <BundleAccordion
                      key={bundleWithStatus.bundle.localizedName}
                      bundleWithStatus={bundleWithStatus}
                      alternateOptions={(
                        bundleWithStatus as BundleWithStatusAndOptions
                      ).options?.filter((newBundle) => {
                        return !bundles
                          .map((bundleWithStatus) => {
                            return bundleWithStatus.bundle.name;
                          })
                          .includes(newBundle.name);
                      })}
                      onChangeBundle={SwapBundle}
                    >
                      {bundleWithStatus.bundle.items.map(
                        (item, index: number) => {
                          if (isRandomizer(item)) {
                            // Guard clause for type coercion
                            return <></>;
                          }
                          const BundleItemWithLocation: BundleItemWithLocation =
                            {
                              ...item,
                              index: index,
                              bundleID: bundleWithStatus.bundle.name,
                            };
                          return (
                            <BooleanCard
                              key={item.itemID + "-" + index}
                              item={BundleItemWithLocation}
                              setIsOpen={setIsOpen}
                              completed={bundleWithStatus.bundleStatus[index]}
                              setObject={setObject}
                              type="bundleItem"
                              show={show}
                            />
                          );
                        },
                      )}
                    </BundleAccordion>
                  );
                })}
              </AccordionSection>
            );
          })}
          <BundleSheet
            open={open}
            setIsOpen={setIsOpen}
            bundleItemWithLocation={object}
          />
          <UnblurDialog
            open={showPrompt}
            setOpen={setPromptOpen}
            toggleShow={toggleShow}
          />
        </div>
      </main>
    </>
  );
}
