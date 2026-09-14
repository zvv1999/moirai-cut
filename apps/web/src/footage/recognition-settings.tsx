"use client";

import { useState } from "react";
import { Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { ProductCatalog } from "./product-catalog";
import { TagSettings, type TagSettingsDraft } from "./tag-settings";
import type { LibraryState } from "./types";

export function RecognitionSettings({
	data,
	disabled,
	onRefresh,
}: {
	data: LibraryState | null;
	disabled: boolean;
	onRefresh: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const draftState = useState<TagSettingsDraft | null>(null);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" disabled={disabled}>
					<Tags />
					商品与标签
				</Button>
			</DialogTrigger>
			<DialogContent
				className="footage-app footage-recognition-dialog"
				aria-describedby={undefined}
				onCloseAutoFocus={(e) => {
					e.stopPropagation();
				}}
				onDragEnter={(e) => e.stopPropagation()}
				onDragOver={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
				onDragLeave={(e) => e.stopPropagation()}
				onDrop={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
			>
				<DialogHeader>
					<DialogTitle>商品与标签配置</DialogTitle>
				</DialogHeader>
				<div className="footage-settings-row">
					<ProductCatalog
						products={data?.products ?? []}
						disabled={disabled}
						onRefresh={onRefresh}
					/>
					<TagSettings
						settings={data?.tagSettings}
						disabled={disabled}
						onRefresh={onRefresh}
						draftState={draftState}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
