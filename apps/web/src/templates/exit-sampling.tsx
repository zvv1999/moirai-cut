import type { ExitSampling, ObservedFrameSampling } from "./types";

const findingLabels: Record<string, string> = {
	insufficient_exit_frames: "退场区间帧数不足",
	insufficient_post_frames: "结束后帧数不足",
	ancestor_or_export_clip: "父组或导出区间提前结束，退出可能被截断",
	no_active_interval: "当前输出中没有有效显示区间",
};

export function ExitSamplingPanel({ value }: { value?: ExitSampling }) {
	if (!value || value.status === "not_requested") return null;
	return <details className="tw-exit-sampling" open={value.status === "warning"}>
		<summary>退场时间预检 · {value.status === "warning" ? "需要调整" : "预计帧数满足要求"}</summary>
		<p>按输出帧率和显示区间预测。仍需查看实际成片，确认退场效果；结束后有帧不代表画面为空。</p>
		<SamplingRecords records={value.records} />
	</details>;
}

function SamplingRecords({ records }: { records: ExitSampling["records"] }) {
	return <>{records.map((record, index) => <div key={`${record.elementId}:${index}`}>
			<strong>{record.templateElementId ?? record.elementId}{record.templateInstanceId ? ` · ${record.templateInstanceId}` : ""}</strong>
			<p>退场区间 {record.exitFrames} / 要求 {record.required.minExitFrames} 帧；结束后 {record.postFrames} / 要求 {record.required.minPostFrames} 帧。</p>
			{record.findings.length > 0 && <ul>{record.findings.map((finding, i) => <li key={`${finding}:${i}`}>{findingLabels[finding] ?? finding}</li>)}</ul>}
		</div>)}</>;
}

export function ObservedFrameSamplingPanel({ value, previewSha256, requested = false }: { value?: ObservedFrameSampling; previewSha256: string; requested?: boolean }) {
	if (!value) return requested ? <p>成片退场采样尚未测量。</p> : null;
	if (value.outputSha256 !== previewSha256) return <p role="alert">成片已变化，退场采样证据需要重新读取。</p>;
	if (value.status === "not_requested") return null;
	if (value.status === "not_measured") return <details><summary>成片退场采样 · 未测量</summary><p>{value.reason ?? "未能读取当前文件的帧时间戳。"}</p></details>;
	return <details className="tw-exit-sampling" open={value.status === "warning"}>
		<summary>成片退场采样 · {value.status === "warning" ? "需要调整" : "帧数满足要求"}</summary>
		<p>已读取当前成片 {value.framesObserved} 帧的编码时间戳。仅确认采样覆盖；退场是否自然、元素是否消失仍需观看。</p>
		<SamplingRecords records={value.records} />
	</details>;
}
