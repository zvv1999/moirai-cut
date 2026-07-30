import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
	fileURLToPath(new URL("../agent-badge.tsx", import.meta.url)),
	"utf8",
);
const workbenchSource = readFileSync(
	fileURLToPath(new URL("../agent-workbench.tsx", import.meta.url)),
	"utf8",
);
const conversationSource = readFileSync(
	fileURLToPath(
		new URL("../../../agent/codex-conversation.ts", import.meta.url),
	),
	"utf8",
);
const performanceSource = readFileSync(
	fileURLToPath(new URL("../../../agent/codex-performance.ts", import.meta.url)),
	"utf8",
);
const dialogSource = readFileSync(
	fileURLToPath(new URL("../../ui/dialog.tsx", import.meta.url)),
	"utf8",
);
const envExampleSource = readFileSync(
	fileURLToPath(new URL("../../../../.env.example", import.meta.url)),
	"utf8",
);

describe("智能剪辑与工程历史分面", () => {
	test("提供两个独立且可访问的入口，不再使用合并入口", () => {
		expect(source).toContain('aria-label="进入智能剪辑"');
		expect(source).toContain('aria-label="打开工程历史"');
		expect(source).not.toContain("智能剪辑与工程历史");
		expect(source).not.toContain("打开工程快照和智能体活动");
	});

	test("使用单一分面状态，保证两个面板不会同时展开", () => {
		expect(source).toContain(
			'type AgentBadgeSurface = "smart-edit" | "project-history" | null;',
		);
		expect(source).toContain(
			"const [openSurface, setOpenSurface] = useState<AgentBadgeSurface>(null);",
		);
		expect(source).toContain('openSurface === "smart-edit"');
		expect(source).toContain('openSurface === "project-history"');
	});

	test("两个入口向辅助技术暴露当前展开状态", () => {
		expect(source).toContain('aria-pressed={openSurface === "smart-edit"}');
		expect(source).toContain(
			'aria-pressed={openSurface === "project-history"}',
		);
	});

	test("智能剪辑直接打开为可访问的对话框", () => {
		expect(source).toContain('open={openSurface === "smart-edit"}');
		expect(source).toContain('aria-label="智能剪辑对话框"');
		expect(workbenchSource).toContain('role="log"');
		expect(workbenchSource).toContain('aria-label="智能剪辑对话记录"');
		expect(workbenchSource).toContain('aria-label="发送智能剪辑需求"');
	});

	test("智能剪辑保持非模态，打开后仍可继续操作时间线", () => {
		expect(source).toContain("modal={false}");
		expect(source).toContain("showOverlay={false}");
		expect(source).toContain("onInteractOutside");
		expect(dialogSource).toContain("showOverlay = true");
		expect(dialogSource).toContain("{showOverlay ? <DialogOverlay /> : null}");
	});

	test("打开后默认把时间线选择直接加入上下文", () => {
		expect(workbenchSource).toContain(
			"const [followSelection, setFollowSelection] = useState(true);",
		);
		expect(workbenchSource).toContain("if (!followSelection) return;");
		expect(workbenchSource).toContain(
			'if (selectedElements.length === 0) {\n\t\t\tfollowedSelectionKey.current = "";\n\t\t\treturn;\n\t\t}',
		);
		expect(workbenchSource).toContain("选中即引用");
		expect(workbenchSource).toContain("visibleReferences.length > 0");
		expect(workbenchSource).toContain(
			"`已引用 ${visibleReferences.length} 项`",
		);
	});

	test("入口使用面向剪辑任务的文案", () => {
		expect(source).toContain('aria-label="进入智能剪辑"');
		expect(source).toContain(">进入智能剪辑<");
		expect(source).not.toContain("问 Codex");
	});

	test("对话框提供时间轴与素材库两类上下文选择器", () => {
		expect(workbenchSource).toContain('aria-label="添加上下文引用"');
		expect(workbenchSource).toContain('aria-label="选择时间轴素材"');
		expect(workbenchSource).toContain('aria-label="选择素材库元素"');
		expect(workbenchSource).toContain("buildMediaContextReferences");
	});

	test("上下文选择器支持搜索、精确时间段、批量引用和 Agent JSON", () => {
		expect(workbenchSource).toContain('aria-label="搜索可引用内容"');
		expect(workbenchSource).toContain('aria-label="引用开始时间（秒）"');
		expect(workbenchSource).toContain('aria-label="引用结束时间（秒）"');
		expect(workbenchSource).toContain("引用精确时间段");
		expect(workbenchSource).toContain("引用筛选结果");
		expect(workbenchSource).toContain("contextSnapshot.contextJson");
		expect(workbenchSource).toContain("复制 JSON");
	});

	test("对话框展示可配置的 Codex Path 连接状态", () => {
		expect(workbenchSource).toContain('fetch("/api/codex/config")');
		expect(workbenchSource).toContain('aria-label="打开智能剪辑设置"');
		expect(workbenchSource).toContain('aria-label="Codex Path"');
		expect(envExampleSource).toContain(
			"CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex",
		);
	});

	test("每条智能剪辑消息直接进入 Codex，不再经过本地计划和质检", () => {
		expect(workbenchSource).toContain('fetch("/api/codex/chat"');
		expect(workbenchSource).toContain("response.body.getReader()");
		expect(workbenchSource).toContain('event.event === "delta"');
		expect(workbenchSource).toContain('event.event === "protocol"');
		expect(workbenchSource).toContain("...(sessionId ? { sessionId } : {})");
		expect(workbenchSource).not.toContain("compileSemanticEdit");
		expect(workbenchSource).not.toContain("计划需要处理");
		expect(workbenchSource).not.toContain("运行质检");
	});

	test("处理过程默认只展示最新一行，展开后也只保留用户可读步骤", () => {
		expect(workbenchSource).toContain('aria-label="智能剪辑处理过程"');
		expect(workbenchSource).toContain("CodexProtocolFrame");
		expect(conversationSource).toContain("protocol?:");
		expect(workbenchSource).toContain("function CodexActivityLine");
		expect(workbenchSource).toContain("const latestFrame = frames.at(-1)");
		expect(workbenchSource).toContain("frames.slice(-6, -1)");
		expect(workbenchSource).toContain('aria-label="查看之前的处理步骤"');
		expect(workbenchSource).toContain('frame.itemType === "agentMessage"');
		expect(workbenchSource).toContain('"回复已生成"');
		expect(workbenchSource).toContain('frame.itemType === "userMessage"');
		expect(workbenchSource).toContain('"已接收剪辑需求"');
		expect(workbenchSource).toContain("正在准备工程上下文…");
		expect(workbenchSource).not.toContain("查看执行详情");
		expect(workbenchSource).not.toContain("{frame.method}");
		expect(workbenchSource).not.toContain("{frame.detail}");
		expect(workbenchSource).not.toContain("个步骤");
		expect(workbenchSource).not.toContain("protocolKindLabel");
		expect(workbenchSource).not.toContain("protocolStatusLabel");
		expect(workbenchSource).not.toContain("Codex 调用流程");
		expect(workbenchSource).not.toContain("原生协议");
		expect(workbenchSource).not.toContain("查看协议详情");
		expect(workbenchSource).not.toContain("app-server · 等待协议事件");
		expect(workbenchSource).not.toContain("Codex 正在处理");
	});

	test("同一工程在关闭重开、刷新和不同页面中恢复同一份会话", () => {
		expect(conversationSource).toContain("/api/codex/history/");
		expect(workbenchSource).toContain("fetchCodexConversation");
		expect(workbenchSource).toContain("persistCodexConversation");
		expect(workbenchSource).toContain("BroadcastChannel");
		expect(workbenchSource).toContain("synchronizeNative: false");
		expect(workbenchSource).toContain("visibilitychange");
		expect(workbenchSource).toContain("15_000");
		expect(workbenchSource).not.toContain(
			"setInterval(hydrateConversation, 1_000)",
		);
		expect(workbenchSource).toContain("conversationHydrated");
		expect(workbenchSource).toContain("crypto.randomUUID()");
		expect(workbenchSource).toContain(
			"const hydrateConversation = async ({",
		);
		expect(workbenchSource).toContain(
			"void hydrateConversation({ synchronizeNative: false }).then",
		);
		expect(workbenchSource).not.toContain("void refreshConversation().finally");
	});

	test("会话首屏先读本地投影并在新消息到达时跟随最新内容", () => {
		expect(workbenchSource).toContain("conversationLogRef");
		expect(workbenchSource).toContain("shouldFollowConversationTail");
		expect(workbenchSource).toContain("scrollTo({");
		expect(workbenchSource).toContain('behavior: "smooth"');
		expect(workbenchSource).not.toContain(
			"if (!conversationHydrated || sending) return;\n\t\tif (!conversationHydrated || sending) return;",
		);
	});

	test("展示工程内的不同会话并可选择原上下文继续对话", () => {
		expect(conversationSource).toContain("CodexConversationThread");
		expect(conversationSource).toContain("conversationId");
		expect(workbenchSource).toContain('aria-label="切换智能剪辑会话"');
		expect(workbenchSource).toContain('aria-label="新建智能剪辑会话"');
		expect(workbenchSource).toContain("createConversation");
		expect(workbenchSource).toContain("selectConversation");
		expect(workbenchSource).toContain(
			"conversation.id === activeConversationId",
		);
		expect(workbenchSource).toContain("sessionId: conversation.sessionId");
	});

	test("对齐 Codex App 的模型、推理强度、协作模式与工具档位", () => {
		expect(workbenchSource).toContain('fetch("/api/codex/capabilities")');
		expect(workbenchSource).toContain('aria-label="Codex 模型"');
		expect(workbenchSource).toContain('aria-label="Codex 推理强度"');
		expect(workbenchSource).toContain('aria-label="Codex 协作模式"');
		expect(workbenchSource).toContain("执行模式");
		expect(workbenchSource).toContain("规划模式");
		expect(workbenchSource).toContain('aria-label="Codex 工具档位"');
		expect(workbenchSource).toContain("专注剪辑");
		expect(workbenchSource).toContain("剪辑与验收");
		expect(workbenchSource).toContain("完整能力");
	});

	test("处理中可以追加指令、停止、重连和压缩上下文", () => {
		expect(workbenchSource).toContain('action: "steer"');
		expect(workbenchSource).toContain('action: "interrupt"');
		expect(workbenchSource).toContain('action: "compact"');
		expect(workbenchSource).toContain("reconnectCodexRun");
		expect(workbenchSource).toContain("继续补充当前任务");
		expect(workbenchSource).toContain("停止处理");
		expect(workbenchSource).toContain("压缩上下文");
	});

	test("默认使用均衡响应档，并保留导演级多模态与完整验收", () => {
		expect(workbenchSource).toContain("DEFAULT_CODEX_PERFORMANCE_MODE");
		expect(workbenchSource).toContain('aria-label="响应模式"');
		expect(performanceSource).toContain(
			'DEFAULT_CODEX_PERFORMANCE_MODE: CodexPerformanceMode = "balanced"',
		);
		expect(performanceSource).toContain('visualMode: "auto"');
		expect(performanceSource).toContain('verificationMode: "full"');
		expect(workbenchSource).toContain("自动识别选区画面");
		expect(workbenchSource).toContain("修改后自动复核");
		expect(workbenchSource).toContain("验证证据");
	});

	test("默认界面对齐 Codex App 的单栏对话层级", () => {
		expect(workbenchSource).toContain('aria-label="切换智能剪辑会话"');
		expect(workbenchSource).toContain('aria-label="打开智能剪辑设置"');
		expect(workbenchSource).toContain('aria-label="智能剪辑设置"');
		expect(workbenchSource).toContain("absolute right-3 top-13 z-20");
		expect(workbenchSource).toContain("messages.length === 0");
		expect(workbenchSource).toContain("高级设置");
		expect(workbenchSource).not.toContain('aria-label="智能剪辑会话记录"');
		expect(workbenchSource).not.toContain("semanticTextCount");
		expect(workbenchSource).not.toContain("semanticKeyframeCount");
		expect(workbenchSource).not.toContain("API 模式");
		expect(source).toContain("max-w-[640px]");
		expect(source).toContain("w-[min(640px,calc(100vw-2rem))]");
	});
});
