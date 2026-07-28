"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	countActiveMediaLibraryFilters,
	type MediaAvailabilityFilter,
	type MediaDurationFilter,
	type MediaFavoriteFilter,
	type MediaLibraryFilters,
	type MediaResolutionFilter,
	type MediaTypeFilter,
	type MediaUsageFilter,
} from "./media-library-filters";
import {
	Cancel01Icon,
	FilterHorizontalIcon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const MEDIA_TYPE_OPTIONS: Array<{
	value: MediaTypeFilter;
	label: string;
}> = [
	{ value: "all", label: "All media" },
	{ value: "video", label: "Videos" },
	{ value: "image", label: "Images" },
	{ value: "audio", label: "Audio" },
];

const DURATION_OPTIONS: Array<{
	value: MediaDurationFilter;
	label: string;
}> = [
	{ value: "all", label: "Any duration" },
	{ value: "under-10", label: "Under 10 seconds" },
	{ value: "10-60", label: "10 to 60 seconds" },
	{ value: "over-60", label: "Over 60 seconds" },
];

const RESOLUTION_OPTIONS: Array<{
	value: MediaResolutionFilter;
	label: string;
}> = [
	{ value: "all", label: "Any resolution" },
	{ value: "sd", label: "SD" },
	{ value: "hd", label: "HD" },
	{ value: "uhd", label: "UHD / 4K" },
];

const USAGE_OPTIONS: Array<{
	value: MediaUsageFilter;
	label: string;
}> = [
	{ value: "all", label: "Any usage" },
	{ value: "used", label: "Used on timeline" },
	{ value: "unused", label: "Unused" },
];

const AVAILABILITY_OPTIONS: Array<{
	value: MediaAvailabilityFilter;
	label: string;
}> = [
	{ value: "all", label: "Available and missing" },
	{ value: "available", label: "Available only" },
	{ value: "missing", label: "Missing only" },
];

const FAVORITE_OPTIONS: Array<{
	value: MediaFavoriteFilter;
	label: string;
}> = [
	{ value: "all", label: "All assets" },
	{ value: "favorite", label: "Favorites only" },
];

export function MediaLibraryControlsView({
	query,
	type,
	filters,
	availableTags,
	resultCount,
	totalCount,
	onQueryChange,
	onTypeChange,
	onFiltersChange,
	onClearAll,
}: {
	query: string;
	type: MediaTypeFilter;
	filters: MediaLibraryFilters;
	availableTags: string[];
	resultCount: number;
	totalCount: number;
	onQueryChange: (query: string) => void;
	onTypeChange: (type: MediaTypeFilter) => void;
	onFiltersChange: (filters: MediaLibraryFilters) => void;
	onClearAll: () => void;
}) {
	const activeFilterCount = countActiveMediaLibraryFilters({ type, filters });
	const hasActiveCriteria = activeFilterCount > 0 || Boolean(query.trim());

	return (
		<div className="bg-background sticky -top-2 z-10 pb-2 pt-2">
			<div className="flex items-center gap-1.5">
				<div className="relative min-w-0 flex-1">
					<HugeiconsIcon
						icon={Search01Icon}
						className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
						aria-hidden="true"
					/>
					<Input
						aria-label="Search assets by filename"
						placeholder="Search"
						value={query}
						onChange={(event) => onQueryChange(event.currentTarget.value)}
						onClear={() => onQueryChange("")}
						showClearIcon
						size="xs"
						className="pl-8"
					/>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label={`Advanced asset filters: ${activeFilterCount} active`}
							title={`Advanced asset filters: ${activeFilterCount} active`}
							size="icon"
							variant={activeFilterCount === 0 ? "outline" : "secondary"}
							className="size-7 shrink-0"
						>
							<HugeiconsIcon icon={FilterHorizontalIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-52">
						<DropdownMenuLabel>Asset filters</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<FilterSubmenu
							label="Media type"
							value={type}
							options={MEDIA_TYPE_OPTIONS}
							onChange={({ value }) => {
								const option = MEDIA_TYPE_OPTIONS.find(
									(candidate) => candidate.value === value,
								);
								if (option) onTypeChange(option.value);
							}}
						/>
						<FilterSubmenu
							label="Duration"
							value={filters.duration}
							options={DURATION_OPTIONS}
							onChange={({ value }) => {
								const option = DURATION_OPTIONS.find(
									(candidate) => candidate.value === value,
								);
								if (option) {
									onFiltersChange({
										...filters,
										duration: option.value,
									});
								}
							}}
						/>
						<FilterSubmenu
							label="Resolution"
							value={filters.resolution}
							options={RESOLUTION_OPTIONS}
							onChange={({ value }) => {
								const option = RESOLUTION_OPTIONS.find(
									(candidate) => candidate.value === value,
								);
								if (option) {
									onFiltersChange({
										...filters,
										resolution: option.value,
									});
								}
							}}
						/>
						<FilterSubmenu
							label="Timeline usage"
							value={filters.usage}
							options={USAGE_OPTIONS}
							onChange={({ value }) => {
								const option = USAGE_OPTIONS.find(
									(candidate) => candidate.value === value,
								);
								if (option) {
									onFiltersChange({ ...filters, usage: option.value });
								}
							}}
						/>
						<FilterSubmenu
							label="Availability"
							value={filters.availability}
							options={AVAILABILITY_OPTIONS}
							onChange={({ value }) => {
								const option = AVAILABILITY_OPTIONS.find(
									(candidate) => candidate.value === value,
								);
								if (option) {
									onFiltersChange({
										...filters,
										availability: option.value,
									});
								}
							}}
						/>
						<FilterSubmenu
							label="Favorite"
							value={filters.favorite}
							options={FAVORITE_OPTIONS}
							onChange={({ value }) => {
								const option = FAVORITE_OPTIONS.find(
									(candidate) => candidate.value === value,
								);
								if (option) {
									onFiltersChange({
										...filters,
										favorite: option.value,
									});
								}
							}}
						/>
						<FilterSubmenu
							label="Tag"
							value={filters.tag ?? "all"}
							options={[
								{ value: "all", label: "Any tag" },
								...availableTags.map((tag) => ({ value: tag, label: tag })),
							]}
							onChange={({ value }) =>
								onFiltersChange({
									...filters,
									tag: value === "all" ? null : value,
								})
							}
						/>
					</DropdownMenuContent>
				</DropdownMenu>
				{hasActiveCriteria ? (
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7 shrink-0"
						aria-label="Clear all asset filters"
						title="Clear all asset filters"
						onClick={onClearAll}
					>
						<HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
					</Button>
				) : null}
			</div>
			<div className="mt-1 flex items-center justify-between gap-2 px-0.5">
				<p className="text-muted-foreground text-[11px]" aria-live="polite">
					{resultCount === totalCount
						? `${totalCount} assets`
						: `${resultCount} of ${totalCount} assets`}
				</p>
				{activeFilterCount > 0 ? (
					<span className="text-primary text-[10px] font-medium">
						{activeFilterCount}{" "}
						{activeFilterCount === 1 ? "filter" : "filters"}
					</span>
				) : null}
			</div>
		</div>
	);
}

function FilterSubmenu({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	onChange: (args: { value: string }) => void;
}) {
	const activeLabel =
		options.find((option) => option.value === value)?.label ?? value;
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<span>{label}</span>
				<span className="text-muted-foreground ml-auto max-w-24 truncate text-[10px]">
					{activeLabel}
				</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="min-w-48">
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={(nextValue) => onChange({ value: nextValue })}
				>
					{options.map((option) => (
						<DropdownMenuRadioItem
							key={option.value}
							value={option.value}
						>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
