"use client";
import { libraryHeaders } from "./library-session";

import { useRef, useState } from "react";
import Image from "next/image";
import {
	ImagePlus,
	Loader2,
	Pencil,
	Plus,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ReferenceProduct } from "./types";

type DraftImage = { id?: string; dataUrl?: string; url: string };

export function ProductCatalog({
	products,
	disabled,
	onRefresh,
}: {
	products: ReferenceProduct[];
	disabled: boolean;
	onRefresh: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState<ReferenceProduct | null>(null);
	const [alias, setAlias] = useState("");
	const [appearance, setAppearance] = useState("");
	const [images, setImages] = useState<DraftImage[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const begin = (product?: ReferenceProduct) => {
		setEditing(product ?? null);
		setAlias(product?.alias ?? "");
		setAppearance(product?.appearance ?? "");
		setImages(product?.images ?? []);
		setError("");
		setConfirmDelete(false);
		setOpen(true);
	};
	const addImages = async (files: FileList | null) => {
		if (!files?.length || busy) return;
		setError("");
		setBusy(true);
		try {
			if (images.length + files.length > 6)
				throw new Error("每个商品最多 6 张参考图");
			const added: DraftImage[] = [];
			for (const file of Array.from(files)) {
				if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
					throw new Error("参考图仅支持 JPG、PNG、WebP");
				if (file.size > 5 * 1024 * 1024)
					throw new Error("单张参考图不能超过 5 MB");
				const dataUrl = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result));
					reader.onerror = () => reject(new Error("图片读取失败"));
					reader.readAsDataURL(file);
				});
				added.push({ dataUrl, url: dataUrl });
			}
			setImages((current) => [...current, ...added]);
		} catch (e) {
			setError(e instanceof Error ? e.message : "图片读取失败");
		} finally {
			setBusy(false);
			if (input.current) input.current.value = "";
		}
	};
	const submit = async (remove = false) => {
		setBusy(true);
		setError("");
		try {
			const response = await fetch(
				`/api/footage/products${remove ? `/${editing?.id}/delete` : ""}`,
				{
					method: "POST",
					headers: {
						...libraryHeaders(),
						"content-type": "application/json",
						"x-requested-with": "moirai-footage",
					},
					body: JSON.stringify(
						remove
							? { baseRevision: editing?.revision }
							: {
									id: editing?.id,
									baseRevision: editing?.revision,
									alias: alias.trim(),
									appearance: appearance.trim(),
									images: images.map(({ id, dataUrl }) => ({ id, dataUrl })),
								},
					),
				},
			);
			const value = await response.json();
			if (!response.ok)
				throw new Error(
					value.error === "revision_conflict"
						? "商品已更新，请关闭后重新编辑"
						: (value.error ?? "保存失败"),
				);
			await onRefresh();
			setOpen(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="footage-products" aria-label="商品识别">
			<div className="footage-products-heading">
				<h2>
					商品识别 <span>{products.length}</span>
				</h2>
				<Button
					variant="outline"
					disabled={disabled || products.length >= 50}
					onClick={() => begin()}
				>
					<Plus />
					添加商品
				</Button>
			</div>
			<div className="footage-products-list">
				{products.length === 0 && (
					<span className="footage-subtle">暂无商品</span>
				)}
				{products.map((p) => (
					<button
						type="button"
						className="footage-product"
						key={p.id}
						disabled={disabled}
						onClick={() => begin(p)}
						title={`编辑商品 ${p.alias}`}
						aria-label={`编辑商品 ${p.alias}`}
					>
						<Image
							src={p.images[0].url}
							alt={p.alias}
							width={48}
							height={48}
							unoptimized
						/>
						<span>
							<strong>{p.alias}</strong>
							<small>{p.images.length} 张参考图</small>
						</span>
						<Pencil size={14} />
					</button>
				))}
			</div>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					if (!busy) setOpen(value);
				}}
			>
				<DialogContent
					className="footage-product-dialog"
					aria-describedby={undefined}
					onDragEnter={(e) => e.stopPropagation()}
					onDragOver={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					onDragLeave={(e) => e.stopPropagation()}
					onDrop={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void addImages(e.dataTransfer.files);
					}}
				>
					<DialogHeader>
						<DialogTitle style={{ letterSpacing: 0 }}>
							{editing ? "编辑商品" : "添加商品"}
						</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<label className="footage-product-label" htmlFor="product-alias">
							商品代称
							<Input
								id="product-alias"
								value={alias}
								onChange={(e) => setAlias(e.target.value)}
								placeholder="例如：小黑"
								maxLength={40}
								disabled={busy}
							/>
						</label>
						<div className="footage-product-label">
							<label htmlFor="product-appearance">商品外观（选填）</label>
							<Textarea
								id="product-appearance"
								className="border-border bg-input"
								rows={3}
								value={appearance}
								onChange={(e) => setAppearance(e.target.value)}
								placeholder="例如：绿色毛绒身体、圆形大眼睛、黄色帽子、黑色背带"
								maxLength={1000}
								disabled={busy}
							/>
						</div>
						<div className="footage-product-label">
							参考图{" "}
							<span className="footage-subtle">
								{images.length} / 6 · JPG、PNG、WebP · 单张不超过 5 MB
							</span>
						</div>
						<div className="footage-reference-grid">
							{images.map((image, index) => (
								<div
									className="footage-reference"
									key={image.id ?? `${index}-${image.url}`}
								>
									<Image
										src={image.url}
										alt={`参考图 ${index + 1}`}
										width={128}
										height={128}
										unoptimized
									/>
									<Button
										type="button"
										size="icon"
										variant="secondary"
										className="footage-reference-remove"
										disabled={busy}
										title={`移除参考图 ${index + 1}`}
										aria-label={`移除参考图 ${index + 1}`}
										onClick={() =>
											setImages((current) =>
												current.filter((_, i) => i !== index),
											)
										}
									>
										<X />
									</Button>
								</div>
							))}
							{images.length < 6 && (
								<button
									type="button"
									className="footage-reference-add"
									disabled={busy}
									title="添加参考图"
									aria-label="添加参考图"
									onClick={() => input.current?.click()}
								>
									<ImagePlus size={24} />
								</button>
							)}
						</div>
						<input
							ref={input}
							type="file"
							accept="image/jpeg,image/png,image/webp"
							multiple
							hidden
							aria-label="商品参考图"
							onChange={(e) => void addImages(e.target.files)}
						/>
						{error && (
							<p className="footage-error" role="alert">
								{error}
							</p>
						)}
						{confirmDelete && (
							<p role="alert">
								删除“{editing?.alias}”的识别配置？已有分镜标签保留。
							</p>
						)}
					</DialogBody>
					<DialogFooter>
						{editing && (
							<Button
								variant="ghost"
								className="mr-auto"
								disabled={busy}
								title="删除商品"
								aria-label="删除商品"
								onClick={() => setConfirmDelete(!confirmDelete)}
							>
								<Trash2 />
							</Button>
						)}
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => setOpen(false)}
						>
							取消
						</Button>
						{confirmDelete ? (
							<Button
								variant="destructive"
								disabled={busy}
								onClick={() => void submit(true)}
							>
								<Trash2 />
								确认删除
							</Button>
						) : (
							<Button
								disabled={busy || !alias.trim() || !images.length}
								onClick={() => void submit()}
							>
								{busy ? <Loader2 className="animate-spin" /> : <Save />}保存商品
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
