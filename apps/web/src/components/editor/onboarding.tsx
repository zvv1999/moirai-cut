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
				return "欢迎使用 OpenCut";
			case 1:
				return "连接智能剪辑环境";
			default:
				return "OpenCut 使用引导";
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
							<Title title="欢迎使用 OpenCut" />
							<p className="text-sm leading-relaxed text-muted-foreground">
								在浏览器中完成专业剪辑，也可以复用本机 Codex 或 Claude 让 Agent
								直接理解并修改当前工程。
							</p>
						</div>
						<div className="grid gap-2 text-xs sm:grid-cols-2">
							<div className="rounded-lg border bg-muted/30 p-3">
								<div className="font-medium">浏览器智能剪辑</div>
								<p className="mt-1 text-muted-foreground">
									自动携带工程、选区和素材上下文。
								</p>
							</div>
							<div className="rounded-lg border bg-muted/30 p-3">
								<div className="font-medium">Agent App 控制</div>
								<p className="mt-1 text-muted-foreground">
									安装 MCP 后可从 Codex 或 Claude 操作。
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
					配置 OpenCut 本地智能剪辑与 Agent App 工程工具。
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
