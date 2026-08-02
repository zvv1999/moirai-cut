"use client";

import { ArrowRightIcon, Film, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import { AgentSetupPanel } from "./agent-setup-panel";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "../ui/dialog";

export function Onboarding() {
	const [step, setStep] = useState(0);
	const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage({
		key: "hasSeenAgentOnboardingV2",
		defaultValue: false,
	});

	const isOpen = !hasSeenOnboarding;

	const handleNext = () => {
		setStep(step + 1);
	};

	const handleClose = () => {
		setHasSeenOnboarding({ value: true });
	};

	const getStepTitle = () => {
		switch (step) {
			case 0:
				return "欢迎使用 Moirai Cut";
			case 1:
				return "连接智能剪辑环境";
			default:
				return "Moirai Cut 使用引导";
		}
	};

	const renderStepContent = () => {
		switch (step) {
			case 0:
				return (
					<div className="space-y-5">
						<div className="flex size-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
							<Film className="size-5" />
						</div>
						<div className="space-y-2">
							<Title title="欢迎使用 Moirai Cut" />
							<p className="text-sm leading-relaxed text-muted-foreground">
								通过对话表达意图，让 Agent
								把变化落到同一条可编辑时间线；你可以随时
								直接操作、实时预览、撤销并继续协作。
							</p>
						</div>
						<div className="grid gap-2 text-xs sm:grid-cols-2">
							<div className="rounded-lg border bg-muted/30 p-3">
								<div className="font-medium">共享编辑循环</div>
								<p className="mt-1 text-muted-foreground">
									对话、直接操作与实时预览共享工程状态。
								</p>
							</div>
							<div className="rounded-lg border bg-muted/30 p-3">
								<div className="font-medium">双向 Agent 控制</div>
								<p className="mt-1 text-muted-foreground">
									浏览器与 Codex 或 Claude 都从当前工程继续。
								</p>
							</div>
						</div>
						<NextButton onClick={handleNext}>检测环境</NextButton>
					</div>
				);
			case 1:
				return (
					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<Sparkles className="size-4 text-cyan-500" />
							<Title title={getStepTitle()} />
						</div>
						<AgentSetupPanel />
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button variant="ghost" onClick={handleClose}>
								稍后配置
							</Button>
							<Button onClick={handleClose}>
								开始创作
								<ArrowRightIcon className="size-4" />
							</Button>
						</div>
					</div>
				);
			default:
				return null;
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[720px]">
				<DialogTitle>
					<span className="sr-only">{getStepTitle()}</span>
				</DialogTitle>
				<DialogDescription className="sr-only">
					配置 Moirai Cut 本地智能剪辑与 Agent App 工程工具。
				</DialogDescription>
				<DialogBody>{renderStepContent()}</DialogBody>
			</DialogContent>
		</Dialog>
	);
}

function Title({ title }: { title: string }) {
	return <h2 className="text-lg font-bold md:text-xl">{title}</h2>;
}

function NextButton({
	children,
	onClick,
}: {
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<Button onClick={onClick} variant="default" className="w-full">
			{children}
			<ArrowRightIcon className="size-4" />
		</Button>
	);
}
