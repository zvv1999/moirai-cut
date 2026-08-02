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
	{ value: "all", label: "全部媒体" },
	{ value: "video", label: "视频" },
	{ value: "image", label: "图片" },
	{ value: "audio", label: "音频" },
];

const DURATION_OPTIONS: Array<{
	value: MediaDurationFilter;
	label: string;
}> = [
	{ value: "all", label: "不限时长" },
	{ value: "under-10", label: "10 秒以内" },
	{ value: "10-60", label: "10 至 60 秒" },
	{ value: "over-60", label: "60 秒以上" },
];

const RESOLUTION_OPTIONS: Array<{
	value: MediaResolutionFilter;
	label: string;
}> = [
	{ value: "all", label: "不限分辨率" },
	{ value: "sd", label: "SD" },
	{ value: "hd", label: "HD" },
	{ value: "uhd", label: "UHD / 4K" },
];

const USAGE_OPTIONS: Array<{
	value: MediaUsageFilter;
	label: string;
}> = [
	{ value: "all", label: "不限使用状态" },
	{ value: "used", label: "已用于时间线" },
	{ value: "unused", label: "未使用" },
];

const AVAILABILITY_OPTIONS: Array<{
	value: MediaAvailabilityFilter;
	label: string;
}> = [
	{ value: "all", label: "全部可用状态" },
	{ value: "available", label: "仅可用素材" },
	{ value: "missing", label: "仅丢失素材" },
];

const FAVORITE_OPTIONS: Array<{
	value: MediaFavoriteFilter;
	label: string;
}> = [
	{ value: "all", label: "全部素材" },
	{ value: "favorite", label: "仅收藏" },
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
						aria-label="按文件名搜索素材"
						placeholder="搜索素材"
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
							aria-label={`高级素材筛选：已启用 ${activeFilterCount} 项`}
							title={`高级素材筛选：已启用 ${activeFilterCount} 项`}
							size="icon"
							variant={activeFilterCount === 0 ? "outline" : "secondary"}
							className="size-7 shrink-0"
						>
							<HugeiconsIcon icon={FilterHorizontalIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-52">
						<DropdownMenuLabel>素材筛选</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<FilterSubmenu
							label="媒体类型"
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
							label="时长"
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
							label="分辨率"
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
							label="时间线使用状态"
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
							label="素材状态"
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
							label="收藏"
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
							label="标签"
							value={filters.tag ?? "all"}
							options={[
								{ value: "all", label: "不限标签" },
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
						aria-label="清除全部素材筛选"
						title="清除全部素材筛选"
						onClick={onClearAll}
					>
						<HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
					</Button>
				) : null}
			</div>
			<div className="mt-1 flex items-center justify-between gap-2 px-0.5">
				<p className="text-muted-foreground text-[11px]" aria-live="polite">
					{resultCount === totalCount
						? `${totalCount} 个素材`
						: `${resultCount} / ${totalCount} 个素材`}
				</p>
				{activeFilterCount > 0 ? (
					<span className="text-primary text-[10px] font-medium">
						{activeFilterCount} 项筛选
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
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
