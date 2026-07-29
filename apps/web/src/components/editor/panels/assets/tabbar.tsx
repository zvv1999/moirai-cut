"use client";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import {
	TAB_KEYS,
	tabs,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";

export function TabBar() {
	const { activeTab, setActiveTab } = useAssetsPanelStore();

	return (
		<div
			className="border-border/80 relative flex h-[56px] shrink-0 border-b"
			data-orientation="horizontal"
		>
			<div
				className="scrollbar-hidden relative flex h-full min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-1.5"
				role="tablist"
				aria-label="创作工具"
			>
				{TAB_KEYS.map((tabKey) => {
					const tab = tabs[tabKey];
					return (
						<Tooltip key={tabKey} delayDuration={10}>
							<TooltipTrigger asChild>
								<Button
									role="tab"
									variant={activeTab === tabKey ? "secondary" : "ghost"}
									size="icon"
									aria-label={tab.label}
									aria-selected={activeTab === tabKey}
									className={cn(
										"relative h-full min-w-11 shrink-0 flex-col gap-1 rounded-none border-0 px-1 text-[10px] leading-none hover:bg-transparent",
										"after:bg-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:transition-transform",
										activeTab !== tabKey && "text-muted-foreground",
										activeTab === tabKey &&
											"bg-transparent text-primary after:scale-x-100",
									)}
									onClick={() => setActiveTab(tabKey)}
								>
									<tab.icon className="size-[18px]" />
									<span>{tab.label}</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent
								side="bottom"
								align="center"
								variant="sidebar"
								sideOffset={5}
							>
								<div className="text-foreground text-sm leading-none font-medium">
									{tab.label}
								</div>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</div>
	);
}
